const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { APP_NAME, FEDERATION_BASE_URL, MODEL_OPTIONS } = require("../shared/constants");
const { ModelManager } = require("./model-manager");
const { UpdateService } = require("./update-service");
const settingsStore = require("./agent/settings-store");
const memory = require("./agent/memory");
const knowledge = require("./agent/knowledge");
const githubClient = require("./agent/github-client");
const rag = require("./agent/rag");
const { runSelfCheck } = require("./agent/self-maintenance");
const selfImprove = require("./agent/self-improve");
const improveDrafts = require("./agent/improve-drafts");
const feedback = require("./agent/feedback");
const systemInfo = require("./agent/system-info");
const learning = require("./agent/learning");
const learningStore = require("./agent/learning-store");
const installer = require("./agent/installer");
const metrics = require("./agent/metrics");
const stats = require("./agent/stats");
const logs = require("./agent/logs");
const agentTools = require("./agent/tools");
const { ollamaReachable } = require("./agent/ollama-client");

const modelManager = new ModelManager();
const updateService = new UpdateService();

// Kendi kendine bakım (güvenli): açıkken periyodik sağlık + bozuk depo onarımı
let lastMaintenance = null;
async function doMaintenance() {
  try {
    if (!settingsStore.getSettings().selfMaintenance) return lastMaintenance;
    lastMaintenance = await runSelfCheck({
      ollamaReachable,
      jsonFiles: [
        { name: "settings", path: process.env.CODEGA_SETTINGS_PATH },
        { name: "memory", path: process.env.CODEGA_MEMORY_PATH, onRepair: () => memory.clearAll() },
        { name: "rag", path: process.env.CODEGA_RAG_PATH, onRepair: () => rag.clearAll() },
      ],
    });
    // Kendini gözlemleme: bakım bulgularını öneri taslağı için say
    try {
      const oll = lastMaintenance.items.find((i) => i.name === "ollama");
      if (oll && oll.status === "down") improveDrafts.recordSignal({ kind: "ollama_down" });
      for (const r of lastMaintenance.repairs || []) improveDrafts.recordSignal({ kind: "store_repair", subject: r });
    } catch (_e) { /* gözlem hatası akışı bozmasın */ }
  } catch (_e) {
    /* bakım hatası uygulamayı etkilemesin */
  }
  return lastMaintenance;
}

// Otonom öneri (opt-in): ajan kendi gözlemlerinden KENDİLİĞİNDEN PR açar.
// GÜVENLİK SINIRI (kod akışında sabit, model değiştiremez): yalnızca AYRI DALDA PR
// açar; ASLA main'e yazmaz, ASLA merge etmez. Her turda en fazla 1 PR (spam yok).
// Sürekli öğrenme (opt-in): açıkken kaynaklardan konu araştırıp belleğe yazar.
// Tur başına 1 konu (yük/spam olmasın). Round-robin için sayaç.
let _learnIdx = 0;
let lastLearn = null;
function learningTopics() {
  const s = settingsStore.getSettings();
  const fromSettings = String(s.learningTopics || "").split(",").map((t) => t.trim()).filter(Boolean);
  // Ajanın konuşmalardan kendi bulduğu konular
  let discovered = [];
  try { discovered = learningStore.getTopics(12); } catch (_e) {}
  // Konu verilmemişse kişisel hafızadan da türet
  let derived = [];
  if (!fromSettings.length && !discovered.length) {
    try {
      const mem = require("./agent/memory");
      const facts = mem.listFacts ? mem.listFacts() : [];
      derived = facts.map((f) => String(f.text || f).replace(/^Kullanıcı(nın)?\s+/i, "").slice(0, 40)).filter(Boolean).slice(0, 5);
    } catch (_e) {}
  }
  // Birleştir + tekilleştir
  const all = [...fromSettings, ...discovered, ...derived];
  return [...new Set(all.map((t) => t.trim()).filter(Boolean))];
}

async function learnOnce(manualTopic) {
  const topics = manualTopic ? [manualTopic] : learningTopics();
  if (!topics.length) return { ok: false, message: "Öğrenilecek konu yok (Ayarlar'dan konu ekle)." };
  const topic = topics[_learnIdx % topics.length];
  _learnIdx += 1;
  const notes = await learning.fetchKnowledge(topic, {
    token: "",
    sources: settingsStore.getSettings().learningSources,
  });
  const added = learningStore.addNotes(notes);

  // #5 Damıtım (opt-in): ham notları modelle kısa kalıcı özete indir
  if (settingsStore.getSettings().distillLearning && notes.length) {
    try {
      const notesText = notes.map((n) => `[${n.source}] ${n.text}`).join("\n");
      const st = modelManager.getStatus ? modelManager.getStatus() : {};
      const model = (st && st.model) || "qwen2.5:3b";
      const summary = await modelManager.generate(model, learning.buildDistillMessages(topic, notesText));
      const clean = String(summary || "").trim();
      if (clean) learningStore.addNotes([{ source: "özet", topic, text: clean.slice(0, 700), url: "", at: Date.now() }]);
    } catch (_e) { /* damıtım başarısızsa ham notlar kalır */ }
  }
  lastLearn = { at: Date.now(), topic, found: notes.length, added, total: learningStore.count() };
  try { logs.info("learning", `Öğrenme: "${topic}" — ${notes.length} kaynak, +${added} not (toplam ${learningStore.count()})`); } catch (_e) {}

  // GitHub yedeği (opsiyonel): learningSyncRepo + token varsa ekle
  const repo = settingsStore.getSettings().learningSyncRepo || "";
  if (added && repo && githubClient.hasToken()) {
    try {
      const { owner, repo: r } = githubClient.splitRepo(repo);
      const meta = await githubClient.getRepoMeta(owner, r);
      const branch = (meta && meta.default_branch) || "main";
      const lines = notes.map((n) => `- [${n.source}] ${n.topic}: ${String(n.text).replace(/\n/g, " ")}${n.url ? ` (${n.url})` : ""}`);
      await githubClient.appendToFile(owner, r, "ogrenilenler.md", branch, lines, `CODEGA AI öğrendi: ${topic}`);
    } catch (_e) { /* yedek hatası öğrenmeyi durdurmasın */ }
  }
  // Anlamsal arama açıksa yeni/eksik notlara embedding üret (Ollama açıkken)
  if (settingsStore.getSettings().semanticSearch) {
    try {
      const emb = require("./agent/embeddings");
      const model = settingsStore.getSettings().embedModel || emb.DEFAULT_EMBED_MODEL;
      await learningStore.backfillEmbeddings((t) => emb.embed(t, { model }), 8);
    } catch (_e) { /* embedding hatası öğrenmeyi durdurmasın */ }
  }
  return { ok: true, ...lastLearn };
}

async function refreshMcpTools() {
  try {
    const s = settingsStore.getSettings();
    if (s.mcpAutoTools && /^https?:\/\//i.test(s.mcpServerUrl || "")) {
      const mcp = require("./agent/mcp-client");
      const { tools: list } = await mcp.listTools(s.mcpServerUrl);
      const added = agentTools.setMcpTools(s.mcpServerUrl, list || []);
      try { logs.info("mcp", `Ajana ${added.length} MCP aracı bağlandı (${s.mcpServerUrl})`); } catch (_e) {}
      return { ok: true, count: added.length, tools: added };
    }
    agentTools.clearMcpTools();
    return { ok: true, count: 0, tools: [] };
  } catch (e) {
    try { agentTools.clearMcpTools(); } catch (_e) {}
    return { ok: false, message: e.message || String(e) };
  }
}

function scheduleLearning() {
  const tick = async () => {
    try { if (settingsStore.getSettings().continuousLearning) await learnOnce(); } catch (_e) {}
  };
  setTimeout(tick, 60 * 1000); // ilk tur ~1 dk sonra
  setInterval(tick, 25 * 60 * 1000); // sonra her 25 dk
}

let lastAutoPropose = null;
async function maybeAutoPropose() {
  try {
    const s = settingsStore.getSettings();
    if (!s.autoProposePR) return;
    const repo = s.knowledgeRepo || "";
    if (!repo || !githubClient.hasToken()) return;
    const proposable = improveDrafts.getProposable();
    if (!proposable.length) return;
    const draft = proposable[0]; // en sık görülen, henüz önerilmemiş
    const proposal = selfImprove.buildProposal({
      idea: draft.idea,
      rationale: draft.rationale,
      version: app.getVersion(),
    });
    const res = await selfImprove.submitProposal(githubClient, repo, proposal);
    improveDrafts.markProposed(draft.key);
    lastAutoPropose = { at: Date.now(), url: res.url, number: res.number, idea: draft.idea };
  } catch (_e) {
    /* otonom öneri hatası uygulamayı/akışı etkilemesin */
  }
}
let lastActivityAt = Date.now();

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: "#050505",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  updateService.attach(win);
  return win;
}

function registerIpc() {
  ipcMain.handle("app:status", async () => {
    const model = await modelManager.detect();
    return {
      appName: APP_NAME,
      version: app.getVersion(),
      paths: {
        userData: app.getPath("userData"),
        models: process.env.OLLAMA_MODELS || "",
      },
      model,
    };
  });

  ipcMain.handle("chat:abort", async () => modelManager.abortCurrent());

  ipcMain.handle("chat:send", async (event, message, opts) => {
    lastActivityAt = Date.now();
    const streamOn = settingsStore.getSettings().streaming !== false;
    const onToken = streamOn
      ? (t) => { try { event.sender.send("chat:stream", t); } catch (_e) {} }
      : null;
    try { if (settingsStore.getSettings().debugLogging) logs.info("chat", `İstek: ${String(message).slice(0, 60)}`); } catch (_e) {}
    return modelManager.ask(message, { onToken, regenerate: !!(opts && opts.regenerate), context: (opts && opts.context) || "" });
  });

  ipcMain.handle("chat:share", async (_event, chat) => {
    // Sondaki "/" önemli: "share" gerçek bir klasör; "/share" (slash yok) sunucuda
    // "/share/"a 301 yönlendirilir ve fetch redirect'i izlerken POST -> GET olur,
    // bu da url'siz yanıta yol açar. Trailing slash bunu engeller.
    const controller = new AbortController();
    // Cloudflare bağlantıyı askıya alırsa istek sonsuza dek beklemesin (yazma kilidi olmasın)
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${FEDERATION_BASE_URL}/share/`, {
        method: "POST",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          // Cloudflare'de bu başlığa "Skip/allow" kuralı yazılabilsin diye
          "X-Codega-Client": "codega-desktop",
        },
        body: JSON.stringify({
          title: chat?.title || "CODEGA AI Sohbeti",
          messages: Array.isArray(chat?.messages) ? chat.messages : [],
          app_version: app.getVersion(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Paylaşım servisi cevap vermedi: ${response.status}`);
      }
      return response.json();
    } catch (e) {
      if (e.name === "AbortError") {
        throw new Error("Paylaşım isteği zaman aşımına uğradı (sunucu/Cloudflare yanıt vermedi).");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });

  ipcMain.handle("models:list", async () => {
    const data = await modelManager.getModels();
    const options = (data.options || []).map((o) => ({ ...o, sizeGb: installer.modelSizeGb(o.id) }));
    return { ...data, options };
  });
  ipcMain.handle("model:delete", async (_event, payload) => {
    const name = (payload && payload.id) || "";
    if (!name) return { ok: false, message: "Model adı gerekli." };
    const { ollamaDeleteModel } = require("./agent/ollama-client");
    const r = await ollamaDeleteModel(name);
    try { logs.info("models", r.ok ? `Model silindi: ${name}` : `Model silinemedi: ${name}`); } catch (_e) {}
    return r;
  });

  // Rehberli kurulum: OS algıla -> boyut göster -> onay -> Ollama kur -> model indir.
  ipcMain.handle("model:setup", async (event, payload) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const send = (m) => {
      try {
        if (!event.sender || event.sender.isDestroyed()) return;
        event.sender.send("model:status", m);
      } catch (_e) {}
    };
    const fmtMB = (b) => (b ? `~${Math.round(b / 1e6)} MB` : "boyut bilinmiyor");

    // 1) Ollama kurulu mu?
    let hasOllama = await installer.detectOllama();
    if (!hasOllama) {
      const url = installer.ollamaInstallerUrl();
      const size = await installer.headSize(url);
      const confirm = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Kur", "Vazgeç"],
        defaultId: 0,
        cancelId: 1,
        title: "Ollama Kurulumu",
        message: "Yerel motor Ollama kurulu değil.",
        detail: `Ollama indirilip kurulacak (${fmtMB(size)}). İşletim sistemin algılandı: ${process.platform}. Onaylıyor musun?`,
      });
      if (confirm.response !== 0) return { ok: false, message: "Kurulum iptal edildi." };

      send({ status: "checking", message: "Ollama kuruluyor… (yönetici onayı çıkabilir)" });
      const r = await installer.installOllama((line) => {
        const clean = String(line).replace(/\s+/g, " ").trim();
        if (clean) send({ status: "checking", message: "Ollama kurulumu: " + clean.slice(0, 90) });
      });
      hasOllama = await installer.detectOllama();
      // Harici (GUI) kurulum hemen bitmez: kullanıcı kurulum penceresini tamamlayana kadar
      // OTOMATİK YOKLA (poll). Böylece "tekrar bas" demek yerine kendiliğinden ilerler.
      if (!hasOllama) {
        send({ status: "installing", message: "Açılan Ollama kurulum penceresini tamamla — otomatik algılayacağım…" });
        const deadline = Date.now() + 6 * 60 * 1000; // 6 dk bekle
        let waited = 0;
        while (!hasOllama && Date.now() < deadline) {
          await new Promise((res) => setTimeout(res, 3000));
          waited += 3;
          hasOllama = await installer.detectOllama();
          if (!hasOllama) send({ status: "installing", message: `Ollama kurulumu bekleniyor… (${waited}sn) — kurulum penceresini tamamla` });
        }
      }
      if (!hasOllama) {
        return {
          ok: false,
          needsManual: !!r.needsManual,
          message: r.needsManual
            ? "Ollama kurulumu süre içinde algılanmadı. Kurulumu tamamladıysan 'Önerilen Modeli Kur'a tekrar bas."
            : (r.message || "Ollama kurulumu doğrulanamadı. Tamamlandıysa tekrar dene."),
        };
      }
      send({ status: "checking", message: "Ollama kuruldu ✓ — model indiriliyor…" });
    }

    // 2) Model indir (önerilen ya da verilen). UI zaten "Önerilen Modeli Kur"
    // veya model satırındaki "İndir" ile açık kullanıcı niyeti alıyor; sistem
    // popup'ı progress panelini kapattığı için burada tekrar onay istemiyoruz.
    const sys = systemInfo.analyze(MODEL_OPTIONS);
    const modelId = (payload && payload.modelId) || (sys.recommended && sys.recommended.id) || undefined;
    const status = await modelManager.prepareModel(modelId, (progress) => send(progress));
    return status;
  });

  ipcMain.handle("model:prepare", async (event, modelId) => {
    const status = await modelManager.prepareModel(modelId, (progress) => {
      try {
        if (!event.sender || event.sender.isDestroyed()) return;
        event.sender.send("model:status", progress);
      } catch (_e) {}
    });
    if (status.action === "install_ollama" && status.actionUrl) {
      await shell.openExternal(status.actionUrl);
      return {
        ...status,
        message: "Ollama indirme sayfası açıldı. Kurulumdan sonra CODEGA AI'yi yeniden aç veya Modeli Hazırla'ya tekrar bas.",
      };
    }
    return status;
  });

  ipcMain.handle("updates:check", async () => updateService.check());
  ipcMain.handle("updates:download", async () => updateService.download());
  ipcMain.handle("updates:install", async () => updateService.installNow());

  ipcMain.handle("settings:get", async () => settingsStore.getSettings());
  ipcMain.handle("settings:set", async (_event, patch) => {
    const next = settingsStore.setSettings(patch);
    if (patch && (("mcpAutoTools" in patch) || ("mcpServerUrl" in patch))) { refreshMcpTools().catch(() => {}); }
    return next;
  });
  ipcMain.handle("mcp:refreshTools", async () => refreshMcpTools());
  ipcMain.handle("memory:list", async () => memory.listFacts());
  ipcMain.handle("memory:clear", async () => memory.clearAll());

  ipcMain.handle("github:test", async () => githubClient.testConnection());
  ipcMain.handle("knowledge:syncUp", async () => knowledge.syncUp());
  ipcMain.handle("knowledge:syncDown", async () => knowledge.syncDown());

  ipcMain.handle("ollama:install", async () => {
    // Güvenlik: sistem yazılımını sessizce/onaysız kurmuyoruz. Resmi indirme
    // sayfasını açarız (tek tık). Platforma göre doğru sayfa.
    const platform = process.platform;
    let url = "https://ollama.com/download";
    if (platform === "darwin") url = "https://ollama.com/download/mac";
    else if (platform === "win32") url = "https://ollama.com/download/windows";
    else if (platform === "linux") url = "https://ollama.com/download/linux";
    await shell.openExternal(url);
    return { ok: true, url };
  });

  ipcMain.handle("rag:ingest", async (_event, payload) => {
    const r = await rag.addDocument(payload?.title || "Doküman", payload?.text || "", { source: "manual" });
    try { logs.info("rag", `Doküman eklendi: ${(payload?.title||"Doküman")} (+${r.added} parça)`); } catch (_e) {}
    return r;
  }
  );
  ipcMain.handle("rag:stats", async () => rag.stats());
  ipcMain.handle("rag:list", async () => rag.listDocuments());
  ipcMain.handle("rag:delete", async (_event, payload) => rag.deleteDocument((payload && payload.docId) || ""));
  ipcMain.handle("rag:search", async (_event, payload) => rag.search((payload && payload.query) || "", 5));
  ipcMain.handle("rag:clear", async () => rag.clearAll());

  ipcMain.handle("maintenance:run", async () => (await doMaintenance()) || { items: [], repairs: [], healthy: true });
  ipcMain.handle("maintenance:status", async () => lastMaintenance);
  ipcMain.handle("dev:prompt", async (_event, payload) => {
    const input = (payload && payload.input) || "";
    if (!input.trim()) return { ok: false, message: "Boş istek." };
    const st = modelManager.getStatus ? modelManager.getStatus() : {};
    const model = (st && st.model) || "qwen2.5:3b";
    try {
      // Yan etkisiz: geçmişe yazmaz, istatistiğe saymaz (doğrudan generate)
      const text = await modelManager.generate(model, [{ role: "user", content: input }]);
      try { logs.info("dev", `Prompt testi (${model})`); } catch (_e) {}
      return { ok: true, model, text: String(text || "").trim() || "(boş yanıt — model kapalı olabilir)" };
    } catch (e) {
      return { ok: false, message: e.message || String(e) };
    }
  });

  ipcMain.handle("security:status", async () => {
    const s = settingsStore.getSettings();
    const mask = (v) => {
      const t = String(v || "").trim();
      if (!t) return null;
      return t.length <= 8 ? "••••" : t.slice(0, 4) + "••••" + t.slice(-2);
    };
    return {
      // Değerler ASLA döndürülmez; yalnızca var/yok + maskeli ipucu
      credentials: [
        { key: "GitHub token", present: !!String(s.githubToken || "").trim(), hint: mask(s.githubToken), note: "Yalnızca bu cihazda (userData) saklanır; kaynağa/ağa yazılmaz." },
        { key: "OpenAI-uyumlu API anahtarı", present: !!String(s.openaiApiKey || "").trim(), hint: mask(s.openaiApiKey), note: "Yalnızca bu cihazda saklanır; yalnızca senin sağlayıcına gider." },
      ],
      permissions: [
        { key: "Kod Çalıştırma", enabled: true, note: "Yalnızca sen 'Çalıştır' deyince; ajan kendiliğinden çalıştırmaz. İzolasyon yok (kendi yetkilerinle)." },
        { key: "MCP araçları (ajana bağlı)", enabled: !!s.mcpAutoTools, note: "Yalnızca senin tanımladığın sunucu; opt-in." },
        { key: "Sürekli Öğrenme (ağ erişimi)", enabled: !!s.continuousLearning, note: "Açıkken kaynaklara internet isteği yapar." },
        { key: "Otomatik Öneri PR", enabled: !!s.autoProposePR, note: "GitHub'da yalnız dal açar; ana dala merge etmez." },
        { key: "GitHub yedek (öğrenilenler)", enabled: !!String(s.learningSyncRepo || "").trim(), note: "Açıksa öğrenilenleri belirttiğin repoya yazar." },
      ],
    };
  });

  ipcMain.handle("automations:status", async () => {
    const s = settingsStore.getSettings();
    return {
      items: [
        {
          key: "continuousLearning",
          label: "Sürekli Öğrenme",
          desc: "GitHub + Web + Wikipedia (+arXiv/SO/HN/MDN) kaynaklarından her ~25 dk konu araştırır.",
          enabled: !!s.continuousLearning,
          last: lastLearn ? { at: lastLearn.at, info: `son konu: ${lastLearn.topic} (+${lastLearn.added})` } : null,
        },
        {
          key: "selfMaintenance",
          label: "Sağlık Denetimi (Kendini Bakım)",
          desc: "Her 5 dk güvenli sağlık denetimi + bozuk JSON onarımı (kod değiştirmez).",
          enabled: !!s.selfMaintenance,
          last: lastMaintenance ? { at: Date.now(), info: lastMaintenance.healthy ? "sağlıklı" : "sorun bulundu/onarıldı" } : null,
        },
        {
          key: "autoProposePR",
          label: "Otomatik Öneri PR",
          desc: "Gözlenen hatalardan iyileştirme taslağı üretip GitHub'da PR açar (yalnız dal; ana dala merge etmez).",
          enabled: !!s.autoProposePR,
          last: lastAutoPropose ? { at: lastAutoPropose.at, info: `PR #${lastAutoPropose.number}` } : null,
        },
      ],
    };
  });

  ipcMain.handle("improve:propose", async (_event, payload) => {
    const repo = (payload && payload.repo) || settingsStore.getSettings().knowledgeRepo || "";
    const idea = (payload && payload.idea) || "";
    if (!repo) throw new Error("Hedef repo gerekli (owner/repo).");
    if (!idea.trim()) throw new Error("Öneri metni boş olamaz.");
    const proposal = selfImprove.buildProposal({
      idea,
      rationale: (payload && payload.rationale) || "",
      version: app.getVersion(),
    });
    return selfImprove.submitProposal(githubClient, repo, proposal);
  });

  ipcMain.handle("improve:drafts", async () => improveDrafts.getDrafts());
  ipcMain.handle("improve:clearDrafts", async () => { improveDrafts.clearAll(); return true; });
  ipcMain.handle("improve:autoStatus", async () => lastAutoPropose);

  ipcMain.handle("feedback:record", async (_event, payload) => {
    const data = feedback.record(payload || {});
    if (payload && payload.rating === "down") {
      try { improveDrafts.recordSignal({ kind: "negative_feedback" }); } catch (_e) {}
    }
    return data;
  });
  ipcMain.handle("feedback:stats", async () => feedback.stats());

  ipcMain.handle("system:analyze", async () => systemInfo.analyze(MODEL_OPTIONS));
  ipcMain.handle("metrics:get", async () => metrics.snapshot());
  ipcMain.handle("stats:get", async () => stats.summary());
  ipcMain.handle("router:info", async () => {
    const mm = require("./model-manager");
    let installed = [];
    try { installed = await modelManager.installedModels(); } catch (_e) { installed = []; }
    const tasks = ["code", "image", "writing", "chat"];
    const labels = { code: "Kod / Yazılım", image: "Görsel", writing: "Yazı / İçerik", chat: "Sohbet" };
    const rows = tasks.map((task) => ({
      task,
      label: labels[task] || task,
      preferred: (mm.TASK_MODELS && mm.TASK_MODELS[task]) || [],
      chosen: mm.chooseModelForTask(task, installed),
    }));
    return { installed, rows };
  });
  ipcMain.handle("router:test", async (_event, payload) => {
    const mm = require("./model-manager");
    const input = (payload && payload.input) || "";
    let installed = [];
    try { installed = await modelManager.installedModels(); } catch (_e) { installed = []; }
    const task = mm.detectTask(input);
    return {
      input,
      task,
      candidates: mm.candidateModelsForTask(task, installed),
      chosen: mm.chooseModelForTask(task, installed),
    };
  });

  ipcMain.handle("logs:get", async () => logs.list(120));
  ipcMain.handle("logs:clear", async () => { logs.clearAll(); logs.info("logs", "Log temizlendi"); return true; });

  ipcMain.handle("learning:now", async (_event, payload) => learnOnce(payload && payload.topic));
  ipcMain.handle("learning:list", async () => ({ notes: learningStore.list(40), total: learningStore.count(), last: lastLearn }));
  ipcMain.handle("learning:clear", async () => { learningStore.clearAll(); return true; });

  ipcMain.handle("mcp:listTools", async (_event, payload) => {
    const mcp = require("./agent/mcp-client");
    const url = (payload && payload.url) || "";
    if (!/^https?:\/\//i.test(url)) throw new Error("Geçerli bir http(s) URL gir.");
    return mcp.listTools(url);
  });
  ipcMain.handle("mcp:callTool", async (_event, payload) => {
    const mcp = require("./agent/mcp-client");
    const url = (payload && payload.url) || "";
    const name = (payload && payload.name) || "";
    if (!/^https?:\/\//i.test(url)) throw new Error("Geçerli bir http(s) URL gir.");
    if (!name) throw new Error("Araç adı gerekli.");
    let args = {};
    if (payload && payload.args) {
      try { args = typeof payload.args === "string" ? JSON.parse(payload.args || "{}") : payload.args; }
      catch (_e) { throw new Error("Argümanlar geçerli JSON olmalı."); }
    }
    return mcp.callTool(url, name, args);
  });

  ipcMain.handle("code:run", async (_event, payload) => {
    const { runCode } = require("./agent/code-runner");
    const lang = (payload && payload.language) || "";
    const code = (payload && payload.code) || "";
    if (!code.trim()) return { ok: false, stdout: "", stderr: "Kod boş.", exitCode: -1 };
    return runCode(lang, code, { timeoutMs: 15000 });
  });

  ipcMain.handle("provider:test", async (_event, payload) => {
    const { openaiTest } = require("./agent/openai-client");
    const s = settingsStore.getSettings();
    return openaiTest({
      baseUrl: (payload && payload.baseUrl) || s.openaiBaseUrl,
      apiKey: (payload && payload.apiKey) || s.openaiApiKey,
      model: (payload && payload.model) || s.openaiModel,
    });
  });
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath("userData");
  // Hafıza ve ayarlar kullanıcının userData dizininde kalıcı olsun
  process.env.CODEGA_MEMORY_PATH =
    process.env.CODEGA_MEMORY_PATH || path.join(userDataPath, "memory.json");
  process.env.CODEGA_SETTINGS_PATH =
    process.env.CODEGA_SETTINGS_PATH || path.join(userDataPath, "agent-settings.json");
  process.env.CODEGA_RAG_PATH =
    process.env.CODEGA_RAG_PATH || path.join(userDataPath, "rag-store.json");
  process.env.CODEGA_IMPROVE_PATH =
    process.env.CODEGA_IMPROVE_PATH || path.join(userDataPath, "improve-drafts.json");
  process.env.CODEGA_FEEDBACK_PATH =
    process.env.CODEGA_FEEDBACK_PATH || path.join(userDataPath, "feedback.json");
  process.env.CODEGA_LEARNING_PATH =
    process.env.CODEGA_LEARNING_PATH || path.join(userDataPath, "learning.json");
  process.env.CODEGA_STATS_PATH =
    process.env.CODEGA_STATS_PATH || path.join(userDataPath, "stats.json");
  process.env.CODEGA_LOGS_PATH =
    process.env.CODEGA_LOGS_PATH || path.join(userDataPath, "logs.json");
  process.env.CODEGA_MODELS_PATH =
    process.env.CODEGA_MODELS_PATH || path.join(userDataPath, "ollama-models");
  process.env.OLLAMA_MODELS = process.env.OLLAMA_MODELS || process.env.CODEGA_MODELS_PATH;
  try { fs.mkdirSync(process.env.OLLAMA_MODELS, { recursive: true }); } catch (_e) {}

  registerIpc();
  createWindow();
  updateService.start();
  await modelManager.detect();

  // Kendi kendine bakım: açılışta bir kez + her 5 dakikada bir (güvenli, kod değiştirmez)
  doMaintenance().then(() => maybeAutoPropose()).catch(() => {});
  setInterval(() => { doMaintenance().then(() => maybeAutoPropose()).catch(() => {}); }, 5 * 60 * 1000);
  scheduleLearning();
  refreshMcpTools().catch(() => {});
  try { logs.info("app", `CODEGA AI ${app.getVersion()} başladı`); } catch (_e) {}
  process.on("uncaughtException", (e) => { try { logs.error("uncaught", e && (e.stack || e.message || e)); } catch (_e2) {} });
  process.on("unhandledRejection", (e) => { try { logs.error("rejection", e && (e.message || e)); } catch (_e2) {} });

  // Başlangıçta GitHub'daki bilgi dosyasını yerel belleğe yükle (yapılandırıldıysa)
  knowledge.syncDown().catch(() => {});

  // Boşta otonom öğrenme: opt-in. Yalnızca öğrenilen NOTLARI GitHub'a senkronlar
  // (kod yazmaz). ~5 dk boşta kalınca ve ayar açıksa çalışır.
  setInterval(() => {
    const s = settingsStore.getSettings();
    if (!s.idleLearning) return;
    if (Date.now() - lastActivityAt < 2 * 60 * 1000) return; // 2 dk boşta değilse atla
    knowledge.syncUp().catch(() => {});
  }, 5 * 60 * 1000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
