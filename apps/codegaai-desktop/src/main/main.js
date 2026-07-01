const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { APP_NAME, FEDERATION_BASE_URL, MODEL_OPTIONS, DEFAULT_MODEL } = require("../shared/constants");
const { ModelManager } = require("./model-manager");
const { ModelUpdateService } = require("./agent/model-update-service");
const { UpdateService } = require("./update-service");
const settingsStore = require("./agent/settings-store");
const memory = require("./agent/memory");
const knowledge = require("./agent/knowledge");
const githubClient = require("./agent/github-client");
const rag = require("./agent/rag");
const { runSelfCheck } = require("./agent/self-maintenance");
const selfImprove = require("./agent/self-improve");
const autonomousDev = require("./agent/autonomous-dev");
const { evaluateAutonomousRun } = require("./agent/autonomous-loop");
const improveDrafts = require("./agent/improve-drafts");
const feedback = require("./agent/feedback");
const systemInfo = require("./agent/system-info");
const learning = require("./agent/learning");
const learningStore = require("./agent/learning-store");
const agentWatch = require("./agent/agent-watch");
const installer = require("./agent/installer");
const modelStorage = require("./agent/model-storage");
const metrics = require("./agent/metrics");
const stats = require("./agent/stats");
const logs = require("./agent/logs");
const agentTools = require("./agent/tools");
const runtimePolicy = require("./agent/runtime-policy");
const { ollamaReachable } = require("./agent/ollama-client");
const { createPhoenixRuntime } = require("./phoenix-core/runtime/phoenix-runtime");
const { registerZipIpc } = require("./agent/zip/zip-ipc");
const { registerGitIpc } = require("./agent/git/git-ipc");
const { registerProjectMemoryIpc } = require("./agent/memory/project-ipc");
const { registerBuilderIpc }       = require("./agent/builder/builder-ipc");
const { registerPluginIpc }        = require("./agent/plugins/plugin-ipc");
const { registerMissionIpc }       = require("./agent/mission/mission-ipc");
const { EvolutionEngine }          = require("./agent/evolution/evolution-engine");
const { codegaDNA, initCodegaDNA } = require("./agent/evolution/codega-dna");
const { contextEngine }            = require("./agent/context/context-engine");
const { registerAEPIpc }              = require("./agent/aep/aep-ipc");
const { aepOS }                       = require("./agent/aep/aep-os");
const { registerACEIpc }              = require("./agent/ace/ace-ipc");
const { initACEOS }                   = require("./agent/ace/ace-os");
const { registerAcademyIpc, getAcademy } = require("./agent/academy/academy-ipc");
const inheritedOllamaModelsPath = String(process.env.OLLAMA_MODELS || "").trim();
let activeModelStorage = null;
let lastMcpHealth = null;

const modelManager = new ModelManager();
const updateService = new UpdateService();
// Phoenix Core v2: merkezi runtime (EventBus + Watchdog + ConversationStore + StreamBuffer + IntentEngine)
const phoenixRuntime = createPhoenixRuntime({ staleMs: 90000, expireMs: 300000 });
const modelUpdateService = new ModelUpdateService({
  updateModel: (name, onProgress) => modelManager.updateModel(name, onProgress),
  catalogOptions: () => ({ token: String(settingsStore.getSettings().githubToken || "").trim() }),
  logs,
});

function broadcastModelUpdateStatus(status) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send("model-updates:status", status);
    } catch (_e) {}
  }
}

function broadcastModelStorageStatus(status) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send("model-storage:status", status);
    } catch (_e) {}
  }
}

async function resolveModelStorage() {
  const configuredPath = String(settingsStore.getSettings().modelStoragePath || "").trim();
  activeModelStorage = await modelStorage.discoverModelStorage({
    configuredPath,
    environmentPath: inheritedOllamaModelsPath,
    codegaDefaultPath: path.join(app.getPath("userData"), "ollama-models"),
  });
  return activeModelStorage;
}

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
      if (modelManager.isBusy && modelManager.isBusy()) {
        try { logs.info("learning", "Damıtım ertelendi: kullanıcı sohbeti aktif"); } catch (_e) {}
      } else {
        const notesText = notes.map((n) => `[${n.source}] ${n.text}`).join("\n");
        const st = modelManager.getStatus ? modelManager.getStatus() : {};
        const model = (st && st.model) || DEFAULT_MODEL;
        const summary = await modelManager.generate(model, learning.buildDistillMessages(topic, notesText));
        const clean = String(summary || "").trim();
        if (clean) learningStore.addNotes([{ source: "özet", topic, text: clean.slice(0, 700), url: "", at: Date.now() }]);
      }
    } catch (_e) { /* damıtım başarısızsa ham notlar kalır */ }
  }
  lastLearn = { at: Date.now(), topic, found: notes.length, added, total: learningStore.count() };
  try { logs.info("learning", `Öğrenme: "${topic}" — ${notes.length} kaynak, +${added} not (toplam ${learningStore.count()})`); } catch (_e) {}

  // GitHub yedeği (opsiyonel): learningSyncRepo + token varsa ekle
  const repo = settingsStore.getSettings().learningSyncRepo || "";
  if (added && repo && githubClient.hasToken()) {
    try {
      const { owner, repo: r } = githubClient.splitRepo(repo);
      const settings = settingsStore.getSettings();
      const meta = await githubClient.getRepoMeta(owner, r);
      const baseBranch = (meta && meta.default_branch) || "main";
      const branch = settings.learningSyncBranch || "codega-knowledge";
      await githubClient.ensureBranch(owner, r, branch, baseBranch);
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
    const permission = runtimePolicy.permissionDecision(s, "mcp");
    if (!permission.allowed) {
      agentTools.clearMcpTools();
      lastMcpHealth = {
        ok: false,
        checkedAt: Date.now(),
        message: permission.requiresApproval
          ? "MCP araçları kullanıcı izni bekliyor."
          : "MCP araçları güvenlik politikasıyla kapalı.",
        toolCount: 0,
        permission: permission.mode,
      };
      return { ok: false, count: 0, tools: [], message: lastMcpHealth.message };
    }
    if (s.mcpAutoTools && /^https?:\/\//i.test(s.mcpServerUrl || "")) {
      const mcp = require("./agent/mcp-client");
      const { tools: list, serverInfo } = await mcp.listToolsWithRetry(s.mcpServerUrl);
      const added = agentTools.setMcpTools(s.mcpServerUrl, list || []);
      lastMcpHealth = {
        ok: true,
        checkedAt: Date.now(),
        serverInfo: serverInfo || null,
        toolCount: added.length,
      };
      try { logs.info("mcp", `Ajana ${added.length} MCP aracı bağlandı (${s.mcpServerUrl})`); } catch (_e) {}
      return { ok: true, count: added.length, tools: added };
    }
    agentTools.clearMcpTools();
    return { ok: true, count: 0, tools: [] };
  } catch (e) {
    try { agentTools.clearMcpTools(); } catch (_e) {}
    lastMcpHealth = { ok: false, checkedAt: Date.now(), message: e.message || String(e), toolCount: 0 };
    return { ok: false, message: e.message || String(e) };
  }
}

function scheduleLearning() {
  const tick = async () => {
    try {
      const settings = settingsStore.getSettings();
      if (settings.scheduledTasksEnabled && settings.continuousLearning) await learnOnce();
    } catch (_e) {}
  };
  setTimeout(tick, 60 * 1000); // ilk tur ~1 dk sonra
  setInterval(tick, 25 * 60 * 1000); // sonra her 25 dk
}

let _agentWatchRunning = false;
let lastAgentWatch = null;
async function runAgentWatch(reason = "scheduled") {
  if (_agentWatchRunning) return lastAgentWatch || agentWatch.status();
  _agentWatchRunning = true;
  try {
    const s = settingsStore.getSettings();
    const result = await agentWatch.scan({ token: String(s.githubToken || "").trim() });
    lastAgentWatch = { at: Date.now(), reason, ...result };
    try { logs.info("agent-watch", `GitHub ajan radari: ${result.healthySources}/${result.sourceCount} kaynak, +${result.newCount} bulgu`); } catch (_e) {}
    if (result.newCount > 0) {
      try {
        learningStore.addNotes(result.findings.slice(0, result.newCount)
          .filter((f) => !f.policy || f.policy.mode !== "blocked")
          .map((f) => ({
          source: "github-agent-watch",
          topic: f.source,
          text: `${f.title}: ${f.detail} [${f.policy && f.policy.mode ? f.policy.mode : "research"}]`,
          url: f.url,
          at: f.at || Date.now(),
          })));
      } catch (_e) {}
    }
    return lastAgentWatch;
  } finally {
    _agentWatchRunning = false;
  }
}

function scheduleAgentWatch() {
  const tick = async () => {
    try {
      const s = settingsStore.getSettings();
      if (!s.scheduledTasksEnabled || !s.agentWatch) return;
      const current = agentWatch.status();
      const hours = Math.max(1, Number(s.agentWatchIntervalHours) || 6);
      if (current.lastScanAt && Date.now() - current.lastScanAt < hours * 60 * 60 * 1000) return;
      await runAgentWatch("scheduled");
    } catch (e) {
      try { logs.warn("agent-watch", e.message || String(e)); } catch (_e) {}
    }
  };
  setTimeout(tick, 90 * 1000);
  setInterval(tick, 30 * 60 * 1000);
}

let lastAutoPropose = null;
let evolutionEngineRef = null;     // otonom evrim döngüsü için modül-seviyesi referans
let lastEvolutionCycleAt = 0;
const EVOLUTION_CYCLE_INTERVAL_MS = 6 * 60 * 60 * 1000; // en sık 6 saatte bir
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
let autonomousDevelopmentRunning = false;
let lastAutonomousDevelopment = null;

async function maybeAutonomousDevelop(trigger = "scheduled") {
  if (autonomousDevelopmentRunning) return null;
  const settings = settingsStore.getSettings();
  const permission = runtimePolicy.permissionDecision(settings, "autonomousDevelopment");
  if (!permission.allowed) {
    settingsStore.setSettings({
      autonomousDevelopmentLastResult: permission.requiresApproval
        ? "Zamanlanmış geliştirme kullanıcı izni bekliyor"
        : "Güvenlik politikası tarafından durduruldu",
    });
    return null;
  }
  const evaluation = evaluateAutonomousRun({
    settings,
    hasToken: githubClient.hasToken(),
    drafts: improveDrafts.getProposable(),
    now: Date.now(),
    lastActivityAt,
  });
  if (!evaluation.ready) return null;

  autonomousDevelopmentRunning = true;
  const startedAt = Date.now();
  settingsStore.setSettings({
    autonomousDevelopmentLastRun: startedAt,
    autonomousDevelopmentLastResult: "Taslak PR hazırlanıyor",
  });
  try {
    const status = modelManager.getStatus ? modelManager.getStatus() : {};
    const model = (status && status.model) || DEFAULT_MODEL;
    const result = await autonomousDev.runAutonomousDevelopment({
      git: githubClient,
      repository: evaluation.repository,
      task: evaluation.task,
      requestedPaths: evaluation.requestedPaths,
      model,
      version: app.getVersion(),
      generate: (messages) => modelManager.generate(model, messages),
    });
    improveDrafts.markProposed(evaluation.draft.key);
    lastAutonomousDevelopment = {
      at: Date.now(),
      trigger,
      ok: true,
      number: result.number,
      url: result.url,
      idea: evaluation.draft.idea,
    };
    settingsStore.setSettings({
      autonomousDevelopmentLastRun: startedAt,
      autonomousDevelopmentLastResult: `Taslak PR #${result.number}`,
    });
    try { logs.info("development", `Gözlem döngüsü taslak PR #${result.number} açtı: ${result.title}`); } catch (_e) {}
    return result;
  } catch (error) {
    const message = error && (error.message || String(error));
    lastAutonomousDevelopment = { at: Date.now(), trigger, ok: false, message };
    settingsStore.setSettings({
      autonomousDevelopmentLastRun: startedAt,
      autonomousDevelopmentLastResult: `Durduruldu: ${String(message).slice(0, 180)}`,
    });
    try { logs.warn("development", `Gözlem döngüsü durdu: ${message}`); } catch (_e) {}
    return null;
  } finally {
    autonomousDevelopmentRunning = false;
  }
}

// OTONOM EVRİM DÖNGÜSÜ (Deep Audit Sprint bulgusu): EvolutionEngine.analyze() ve
// aepOS.runCycle() yalnız renderer IPC'sinden erişilebiliyordu — kendiliğinden
// HİÇ çalışmıyordu. Burada analiz → AEP cycle (backlog/genome/intel/timeline)
// bağlanır. ÖNERİ-ONLY: asla otomatik merge/patch yok; yalnız backlog/öneri üretir.
// 6 saatte bir throttle; ayarla kapatılabilir.
async function maybeRunEvolutionCycle() {
  try {
    if (settingsStore.getSettings().evolutionCycleEnabled === false) return;
    if (!evolutionEngineRef || !aepOS.isInitialized()) return;
    if (Date.now() - lastEvolutionCycleAt < EVOLUTION_CYCLE_INTERVAL_MS) return;
    lastEvolutionCycleAt = Date.now();

    const report = await evolutionEngineRef.analyze();
    const version = app.getVersion();
    const result = await aepOS.runCycle(report, version);
    // Zaman çizelgesine kalıcı olay (kendi geçmişini bilsin).
    try {
      aepOS.timeline.add({
        type: "decision",
        title: `Otonom evrim döngüsü: +${result?.tasksAdded || 0} görev, +${result?.proposalsAdded || 0} öneri`,
        version,
        why: "Periyodik self-analiz; backlog/genome/competitive-intel güncellendi (öneri-only).",
        tags: ["evolution", "autonomous"],
      });
    } catch (_e) {}
  } catch (_e) {
    /* otonom evrim hatası uygulamayı/akışı etkilemesin */
  }
}

async function runMaintenanceAutomations() {
  if (settingsStore.getSettings().scheduledTasksEnabled === false) return;
  await doMaintenance();
  await maybeRunEvolutionCycle();
  const development = await maybeAutonomousDevelop("maintenance");
  if (!development) await maybeAutoPropose();
}

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
    const storage = await resolveModelStorage();
    return {
      appName: APP_NAME,
      version: app.getVersion(),
      paths: {
        userData: app.getPath("userData"),
        models: storage.path || "",
        modelStorage: {
          files: storage.files || 0,
          bytes: storage.bytes || 0,
          source: storage.source || "",
        },
      },
      model,
    };
  });

  ipcMain.handle("chat:abort", async () => modelManager.abortCurrent());

  // ZIP Engine IPC handlers
  registerZipIpc();

  // Git Agent IPC handlers
  registerGitIpc();

  // Project Memory IPC handlers
  registerProjectMemoryIpc();
  registerBuilderIpc();
  registerPluginIpc();

  // MissionOS IPC — Sprint 10
  // generateFn: mevcut modelManager.ask ile uyumlu wrapper
  const missionGenerateFn = async (messages) => {
    const systemMsg = messages.find(m => m.role === "system");
    const userMsg   = messages.find(m => m.role === "user");
    const prompt    = [systemMsg?.content, userMsg?.content].filter(Boolean).join("\n\n");
    const result    = await modelManager.ask(prompt, { context: systemMsg?.content || "" });
    return result?.text || "";
  };
  registerMissionIpc(null, missionGenerateFn);  // win lazily resolved via BrowserWindow.getAllWindows()

  // AEP — Autonomous Evolution Platform — Sprint XX
  const githubSettings = settingsStore.getSettings();
  const aepGitHub = {
    token: String(githubSettings.githubToken || "").trim(),
    owner: "codegatr",
    repo : "codegaai",
  };
  registerAEPIpc(missionGenerateFn, aepGitHub);

  // ACE — Artificial Cognition Engine — Sprint ACE (alpha.26)
  registerACEIpc(missionGenerateFn);

  // CODEGA AI Academy — kalici muhendislik egitim alt sistemi (Phase I).
  // IPC handler'lari hemen kaydedilir; ACE EngineeringBrain async init bitince
  // baglanir, boylece gecilen derslerin kurallari canli chat prompt'una akar.
  registerAcademyIpc(null);
  initACEOS(path.join(app.getPath("userData"), "ace"))
    .then((aceOS) => {
      try {
        const academy = getAcademy();
        academy?.setEngineeringBrain(aceOS.engineeringBrain);
        // Çekirdek mühendislik kurallarını canlı prompt'a seed et (idempotent dedup).
        const seeded = academy?.seedCoreEngineeringRules?.() || 0;
        if (seeded) console.log(`[Academy] ${seeded} çekirdek mühendislik kuralı EngineeringBrain'e seed edildi.`);
      } catch (_e) {}
    })
    .catch((e) => console.warn("[Academy] brain bind:", e.message));

  // Evolution Engine + CODEGA DNA init — Sprint 11
  const evoDataDir = path.join(app.getPath("userData"), "evolution");
  const evolutionEngine = new EvolutionEngine(
    path.join(__dirname, "..", ".."),  // proje kökü
    evoDataDir
  );
  evolutionEngine.init().catch(e => console.warn("[Evolution] init:", e.message));
  evolutionEngineRef = evolutionEngine; // otonom evrim döngüsü erişebilsin
  // İlk otonom evrim döngüsünü AÇILIŞTA çalıştırma — kullanıcı aktif sohbet
  // ederken ağır analiz event-loop'la yarışmasın. İlk koşu 6sa sonra.
  lastEvolutionCycleAt = Date.now();
  initCodegaDNA(evoDataDir).catch(e => console.warn("[DNA] init:", e.message));

  const aceDataDir = path.join(app.getPath("userData"), "ace");

  ipcMain.handle("chat:send", async (event, message, opts) => {
    lastActivityAt = Date.now();

    // ─── DIAGNOSTIC TRACE ──────────────────────────────────────────────────
    // Her aşamanın süresini ölç (orkestrasyon kilitlenmelerini görünür kıl).
    // Hiçbir şey kara kutu olmasın: 1sn'yi aşan aşama WARN'lanır, özet her
    // istekte 'chat_trace' olarak loglanır. TTFT (ilk token süresi) dahil.
    const _trace = { startedAt: Date.now() };
    const _step = (label, sinceMs) => {
      const dt = Date.now() - sinceMs;
      _trace[label] = dt;
      if (dt > 1000) { try { logs.warn("chat_trace", `YAVAŞ aşama: ${label}=${dt}ms`); } catch (_e) {} }
      return Date.now();
    };
    let _t = Date.now();

    // ─── ACE — Artificial Cognition Engine ─────────────────────────────────
    // Her mesajdan önce: referans çözümle ("devam et" → aktif görev,
    // "Ateş Fiat" → ProjectBrain'den o projeyi aktive et), sonra bu turun
    // tüm bağlamını (kullanıcı + proje + hedef + life graph) inşa et.
    // LLM'e ASLA boş bağlamla gidilmez.
    // MOD SEÇİMİ:
    //  - BİLİŞSEL MOD (varsayılan): ACE referans çözümü + BOUNDED bilişsel özet
    //    (proje/karar/hedef/ders) → yalın üretim. "falanca sorunu çöz"/"Ateş Fiat"
    //    atıflarını hatırlar AMA takılmaz (özet kısa, ağır pipeline yok).
    //  - BASİT MOD (simpleMode=true, opt-in): hafızasız saf-yalın (max hız).
    //  - DERİN MOD (deepMode=true, opt-in): tam pipeline (chunking/doğrulama/escalation).
    const _settings = settingsStore.getSettings();
    const simpleMode = _settings.simpleMode === true;
    const deepMode = _settings.deepMode === true;

    const aceOS = await initACEOS(aceDataDir);
    _t = _step("ace_init", _t);
    const aceIntake = aceOS.processIncoming(message, "default");
    _t = _step("ace_intake", _t);
    let resolvedMessage = aceIntake.message;

    // BİLİŞSEL ÖZET (bounded) — bilişsel modda modele "anlam" verir. Simple/deep
    // dışındaki varsayılan yol. Ucuz ve kısa; takılma riski yok.
    let cognitiveBrief = "";
    if (!simpleMode && !deepMode) {
      try { cognitiveBrief = aceOS.buildBrief({ userId: "default", maxChars: 1600 }); } catch (_e) {}
      _trace.brief_chars = cognitiveBrief.length;
    }

    let contextPacket = null;
    let mergedContext = "";
    if (deepMode) {
      // ─── Context Engine — Sprint 10 (yalnız DERİN modda) ────────────────
      try {
        contextPacket   = contextEngine.analyze(resolvedMessage);
        resolvedMessage = contextPacket.resolvedMessage || resolvedMessage;
        try { event.sender.send("chat:context", {
          type:        contextPacket.type,
          reason:      contextPacket.reason,
          confidence:  contextPacket.confidence,
          resolved:    resolvedMessage !== message,
        }); } catch (_e) {}
      } catch (_e) {}
      _t = _step("context_engine", _t);

      const aceContext = aceOS.buildContext({ userId: "default", topic: resolvedMessage });
      _t = _step("ace_build_context", _t);
      mergedContext = [
        (opts && opts.context) || "",
        contextPacket?.compressedContext || "",
        aceContext.context || "",
      ].filter(Boolean).join("\n\n");
    }
    _trace.context_chars = mergedContext.length;
    _trace.simple = simpleMode;

    // Phoenix Core v2: intent sınıflandırması + görev başlatma
    const { taskId, chatId, intent } = phoenixRuntime.startChat(resolvedMessage, {
      chatId: (opts && opts.chatId) || "",
      regenerate: !!(opts && opts.regenerate),
      context: mergedContext,
    });
    _t = _step("intent", _t);

    try { if (settingsStore.getSettings().debugLogging) logs.info("chat", `[${intent.intent}] ${String(message).slice(0, 60)}`); } catch (_e) {}

    // FastPath: basit sorgular LLM'e gitmeden anında yanıt alır
    if (intent.fastAnswer !== undefined && !intent.needsModel) {
      const fastResult = { text: intent.fastAnswer, source: "fast_path", intent: intent.intent };
      try { event.sender.send("chat:stream", intent.fastAnswer); } catch (_e) {}
      phoenixRuntime.finishChat(taskId, chatId, fastResult);
      try { logs.info("chat_trace", `FAST_PATH ${intent.intent} | ace=${_trace.ace_init || 0}+${_trace.ace_intake || 0}ms ctx=${_trace.context_engine || 0}ms build=${_trace.ace_build_context || 0}ms intent=${_trace.intent || 0}ms ctxChars=${_trace.context_chars || 0} total=${Date.now() - _trace.startedAt}ms`); } catch (_e) {}
      return fastResult;
    }

    const streamOn = settingsStore.getSettings().streaming !== false;
    const _modelStartedAt = Date.now();
    let _ttft = 0;
    const onToken = streamOn
      ? (t) => {
          if (!_ttft) { _ttft = Date.now() - _modelStartedAt; if (_ttft > 1000) { try { logs.warn("chat_trace", `TTFT (ilk token) ${_ttft}ms`); } catch (_e) {} } }
          try { event.sender.send("chat:stream", t); } catch (_e) {}
          phoenixRuntime.onToken(taskId, chatId, t); // buffer + watchdog + EventBus
        }
      : null;
    const onProgress = (payload) => {
      try { event.sender.send("chat:status", payload); } catch (_e) {}
    };

    let result;
    try {
      const histOpt = Array.isArray(opts && opts.history) ? opts.history : [];
      if (deepMode) {
        // Tam bilişsel pipeline (chunking/doğrulama/escalation).
        result = await modelManager.ask(resolvedMessage, {
          onToken, onProgress,
          regenerate: !!(opts && opts.regenerate),
          context: mergedContext,
          chatId,
          history: histOpt,
        });
      } else {
        // Bilişsel-yalın (varsayılan) VEYA basit-yalın. İkisi de askDirect; fark
        // bilişsel özetin eklenip eklenmemesi. Bağlam sürekliliği: renderer geçmişi.
        result = await modelManager.askDirect(resolvedMessage, {
          onToken, chatId,
          history: histOpt,
          cognitiveContext: simpleMode ? "" : cognitiveBrief,
        });
      }
    } catch (err) {
      try { logs.warn("chat_trace", `FAILED prep=${_modelStartedAt - _trace.startedAt}ms ttft=${_ttft || "—"} total=${Date.now() - _trace.startedAt}ms reason=${err?.message || err}`); } catch (_e) {}
      phoenixRuntime.abortChat(taskId, chatId, err?.message || "model_error");
      throw err;
    }
    _trace.model_total = Date.now() - _modelStartedAt;

    // Tamamlanma: buffer kapat, konuşmaya ekle, watchdog temizle
    phoenixRuntime.finishChat(taskId, chatId, result);
    // DIAGNOSTIC özeti: orkestrasyon (LLM öncesi) vs üretim ayrımı net görünür.
    try {
      const prep = _modelStartedAt - _trace.startedAt;
      logs.info("chat_trace",
        `MODEL ${result?.source || "?"} | prep=${prep}ms (ace=${(_trace.ace_init||0)+(_trace.ace_intake||0)} ctx=${_trace.context_engine||0} build=${_trace.ace_build_context||0} intent=${_trace.intent||0}) ctxChars=${_trace.context_chars||0} ttft=${_ttft || "—"}ms model=${_trace.model_total}ms total=${Date.now() - _trace.startedAt}ms`);
    } catch (_e) {}

    // Context Engine'e bu tur mesajları kaydet
    try {
      contextEngine.push("user",      resolvedMessage);
      contextEngine.push("assistant", result?.text || "");
    } catch (_e) {}

    // ACE — bu turu ConversationMemory/ProjectBrain/LifeGraph'e işle.
    try {
      aceOS.recordTurn({ userId: "default", userMessage: resolvedMessage, assistantText: result?.text || "" });
    } catch (_e) {}

    return result;
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
        redirect: "error",
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
  ipcMain.handle("model-storage:move", async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const selected = await dialog.showOpenDialog(win, {
      title: "Ollama model dizinini seç",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Bu klasöre taşı",
    });
    if (selected.canceled || !selected.filePaths?.[0]) return { ok: false, canceled: true };

    const discovered = await resolveModelStorage();
    const source = path.resolve(discovered.path || "");
    const target = path.resolve(selected.filePaths[0]);
    modelStorage.validateMove(source, target);
    const stats = { files: discovered.files || 0, bytes: discovered.bytes || 0 };
    if (!stats.files) {
      throw new Error(
        `Taşınacak Ollama modeli bulunamadı. Kontrol edilen kaynak: ${source}. ` +
        "Önce Ollama'da kurulu modellerin göründüğünü doğrula."
      );
    }
    const existingTargetStats = await modelStorage.directoryStats(target);
    if (existingTargetStats.files > 0) {
      throw new Error("Hedef klasör boş olmalı. D: üzerinde yeni ve boş bir klasör seç.");
    }
    const sizeGb = (stats.bytes / (1024 ** 3)).toFixed(stats.bytes >= 1024 ** 3 ? 1 : 2);
    const confirm = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Taşı", "Vazgeç"],
      defaultId: 0,
      cancelId: 1,
      title: "Model Dizini Taşıma",
      message: "Kurulu Ollama modelleri yeni dizine taşınacak.",
      detail: [
        `Kaynak: ${source}`,
        `Hedef: ${target}`,
        `Veri: ${stats.files} dosya, yaklaşık ${sizeGb} GB`,
        "",
        "Ollama kısa süre durdurulacak. Yeni kopya doğrulanmadan eski dosyalar silinmez.",
      ].join("\n"),
    });
    if (confirm.response !== 0) return { ok: false, canceled: true };

    broadcastModelStorageStatus({ phase: "stopping", message: "Ollama güvenli şekilde durduruluyor." });
    await installer.stopOllama();
    let persistedTarget = false;
    let copiedTarget = false;
    try {
      const result = fs.existsSync(source)
        ? await modelStorage.moveModelStorage(source, target, {
          onProgress: broadcastModelStorageStatus,
          removeSource: false,
        })
        : { ok: true, source, target, files: 0, bytes: 0 };
      copiedTarget = true;
      await installer.persistOllamaModelsPath(target);
      persistedTarget = true;
      settingsStore.setSettings({ modelStoragePath: target });
      process.env.CODEGA_MODELS_PATH = target;
      process.env.OLLAMA_MODELS = target;
      activeModelStorage = { ...result, path: target, source: "configured", exists: true, hasLayout: true };
      broadcastModelStorageStatus({ phase: "restarting", message: "Ollama yeni model diziniyle başlatılıyor." });
      await installer.restartOllama(target);
      let reachable = false;
      for (let attempt = 0; attempt < 15 && !reachable; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        reachable = await ollamaReachable();
      }
      if (!reachable) throw new Error("Ollama yeni model diziniyle başlatılamadı. Eski dizin geri yükleniyor.");
      await modelManager.detect();
      const installedAfterMove = await modelManager.installedModels();
      if (!installedAfterMove.length) {
        throw new Error("Yeni dizindeki modeller Ollama tarafından görülmedi. Eski dizin geri yükleniyor.");
      }
      if (fs.existsSync(source)) {
        broadcastModelStorageStatus({ phase: "cleaning", message: "Yeni dizin doğrulandı; eski model dosyaları temizleniyor." });
        await fs.promises.rm(source, { recursive: true, force: true });
      }
      broadcastModelStorageStatus({ phase: "complete", message: "Modeller yeni dizine taşındı.", path: target });
      try { logs.info("models", `Model dizini taşındı: ${source} -> ${target}`); } catch (_e) {}
      return { ...result, path: target };
    } catch (error) {
      broadcastModelStorageStatus({ phase: "error", message: error.message || String(error) });
      if (persistedTarget) {
        try {
          await installer.persistOllamaModelsPath(source);
          settingsStore.setSettings({ modelStoragePath: source });
          process.env.CODEGA_MODELS_PATH = source;
          process.env.OLLAMA_MODELS = source;
          activeModelStorage = await resolveModelStorage();
        } catch (_e) {}
      }
      try { await installer.restartOllama(source); } catch (_e) {}
      if (copiedTarget && fs.existsSync(target)) {
        try { await fs.promises.rm(target, { recursive: true, force: true }); } catch (_e) {}
      }
      throw error;
    }
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
        if (clean) send({ status: "checking", message: clean.slice(0, 120) });
      });
      // installOllama() artık kendi içinde waitForOllama() yapıyor.
      // ok=true ise Ollama zaten çalışıyor; ok=false ise hata mesajı döner.
      if (!r.ok) {
        return {
          ok: false,
          message: r.message || "Ollama kurulumu başarısız. Lütfen ollama.com/download adresinden manuel kur.",
        };
      }
      hasOllama = true;
      send({ status: "checking", message: "Ollama kuruldu ✓ — model indiriliyor…" });
    }

    // 2) Model indir (önerilen ya da verilen). UI zaten "Önerilen Modeli Kur"
    // veya model satırındaki "İndir" ile açık kullanıcı niyeti alıyor; sistem
    // popup'ı progress panelini kapattığı için burada tekrar onay istemiyoruz.
    // Öncelik: (1) explicit modelId, (2) VRAM-aware cookbook önerisi, (3) RAM-only fallback
    let modelId = payload && payload.modelId;
    if (!modelId) {
      try {
        const { MODEL_CATALOG } = require("../shared/constants");
        const catalog = MODEL_OPTIONS
          .map((o) => ({ ...o, ...(MODEL_CATALOG[o.id] || {}) }))
          .filter((o) => o.minVramGb);
        const ck = await systemInfo.analyzeCookbook(catalog);
        modelId = ck.recommended && ck.recommended.id;
      } catch (_e) {}
      if (!modelId) {
        const sys = systemInfo.analyze(MODEL_OPTIONS);
        modelId = sys.recommended && sys.recommended.id;
      }
    }
    const status = await modelManager.prepareModel(modelId, (progress) => send(progress));
    if (status && status.status === "ready" && status.model) {
      settingsStore.setSettings({ defaultModel: status.model });
      await modelManager.detect();
      return {
        ...modelManager.getStatus(),
        defaultModel: status.model,
        message: `${status.model} varsayılan model olarak hazır.`,
      };
    }
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

  ipcMain.handle("model-updates:status", async () => modelUpdateService.snapshot());
  ipcMain.handle("model-updates:check", async () => {
    const status = await modelUpdateService.check();
    broadcastModelUpdateStatus(status);
    return status;
  });
  ipcMain.handle("model-updates:apply", async (event, name) => {
    const result = await modelUpdateService.apply(name, (progress) => {
      try {
        if (!event.sender || event.sender.isDestroyed()) return;
        event.sender.send("model:status", progress);
      } catch (_e) {}
    });
    broadcastModelUpdateStatus(result.updates);
    return result;
  });

  ipcMain.handle("updates:check", async () => updateService.check());
  ipcMain.handle("updates:download", async () => updateService.download());
  ipcMain.handle("updates:install", async () => updateService.installNow());

  ipcMain.handle("settings:get", async () => settingsStore.getSettings());
  ipcMain.handle("notifications:send", (_event, opts) => {
    if (!settingsStore.getSettings().notifications) return false;
    const { Notification } = require("electron");
    if (!Notification.isSupported()) return false;
    const title = String((opts && opts.title) || "CODEGA AI").slice(0, 80);
    const body  = String((opts && opts.body)  || "").slice(0, 200);
    new Notification({ title, body }).show();
    return true;
  });
  ipcMain.handle("external:open", async (_event, rawUrl) => {
    const url = String(rawUrl || "").trim();
    if (!/^https:\/\/github\.com\//i.test(url)) throw new Error("Yalnızca GitHub bağlantıları açılabilir.");
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle("settings:set", async (_event, patch) => {
    const next = settingsStore.setSettings(patch);
    if (patch && (("mcpAutoTools" in patch) || ("mcpServerUrl" in patch))) { refreshMcpTools().catch(() => {}); }
    return next;
  });
  ipcMain.handle("workspace:addTrusted", async () => {
    const selected = await dialog.showOpenDialog({
      title: "Güvenilen çalışma klasörü seç",
      properties: ["openDirectory", "createDirectory"],
    });
    if (selected.canceled || !selected.filePaths[0]) return settingsStore.getSettings();
    const current = settingsStore.getSettings();
    return settingsStore.setSettings({
      trustedFolders: [...(current.trustedFolders || []), selected.filePaths[0]],
    });
  });
  ipcMain.handle("workspace:removeTrusted", async (_event, folder) => {
    const target = runtimePolicy.normalizeFolder(folder);
    const current = settingsStore.getSettings();
    return settingsStore.setSettings({
      trustedFolders: (current.trustedFolders || []).filter(
        (item) => runtimePolicy.normalizeFolder(item) !== target,
      ),
    });
  });
  ipcMain.handle("mcp:refreshTools", async () => refreshMcpTools());
  ipcMain.handle("mcp:health", async () => {
    const settings = settingsStore.getSettings();
    const url = String(settings.mcpServerUrl || "").trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false, configured: false, message: "MCP sunucusu tanımlı değil." };
    const mcp = require("./agent/mcp-client");
    lastMcpHealth = await mcp.healthCheck(url);
    return { configured: true, ...lastMcpHealth };
  });
  ipcMain.handle("memory:list", async () => memory.listFacts());
  ipcMain.handle("memory:clear", async () => memory.clearAll());

  // Evolution Engine IPC — Sprint 11
  ipcMain.handle("evolution:analyze", async () => {
    try {
      const report = await evolutionEngine.analyze();
      return { ok: true, data: report };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });

  ipcMain.handle("evolution:reports", async (_e, n) => {
    try {
      return { ok: true, data: await evolutionEngine.loadReports(Number(n) || 10) };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });

  // CODEGA DNA IPC — Sprint 11
  ipcMain.handle("evolution:dna:evaluate", async (_e, opts) => {
    try {
      const record = await codegaDNA.evaluate(opts || {});
      return { ok: true, data: record };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });

  ipcMain.handle("evolution:dna:list", async () => {
    try { return { ok: true, data: codegaDNA.listAll() }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });

  ipcMain.handle("evolution:dna:trend", async (_e, n) => {
    try { return { ok: true, data: codegaDNA.trend(Number(n) || 10) }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });

  ipcMain.handle("evolution:dna:by-version", async (_e, version) => {
    try { return { ok: true, data: codegaDNA.getByVersion(String(version)) }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });

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
    const model = (st && st.model) || DEFAULT_MODEL;
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
        { key: "Claude API anahtarı", present: !!String(s.claudeApiKey || "").trim(), hint: mask(s.claudeApiKey), note: "Yalnızca bu cihazda saklanır; yalnızca Anthropic API'ye gider." },
        { key: "Gemini API anahtarı", present: !!String(s.geminiApiKey || "").trim(), hint: mask(s.geminiApiKey), note: "Yalnızca bu cihazda saklanır; yalnızca Google Gemini API'ye gider." },
      ],
      permissions: [
        {
          key: "Güvenilen çalışma alanları",
          enabled: Array.isArray(s.trustedFolders) && s.trustedFolders.length > 0,
          note: s.trustedFolders && s.trustedFolders.length
            ? `${s.trustedFolders.length} klasör ajan işlemlerine açık.`
            : "Henüz güvenilen klasör yok; dosya ve geliştirme eylemleri onay gerektirir.",
        },
        {
          key: "Model otomatik yedekleme",
          enabled: s.modelAutoFallback !== false,
          note: runtimePolicy.configuredProviderChain(s).join(" → "),
        },
        {
          key: "Zamanlanmış görevler",
          enabled: s.scheduledTasksEnabled !== false,
          note: "Öğrenme, ajan radarı, bakım ve model kontrollerinin ana anahtarı.",
        },
        { key: "Otonom Kod Geliştirme", enabled: !!s.autonomousDevelopment, note: "Yalnız seçilen dosyaları okur; ayrı dalda taslak PR açar ve otomatik birleştirmez." },
        { key: "Kod Çalıştırma", enabled: true, note: "Yalnızca sen 'Çalıştır' deyince; ajan kendiliğinden çalıştırmaz. İzolasyon yok (kendi yetkilerinle)." },
        { key: "MCP araçları (ajana bağlı)", enabled: !!s.mcpAutoTools, note: "Yalnızca senin tanımladığın sunucu; opt-in." },
        { key: "Sürekli Öğrenme (ağ erişimi)", enabled: !!s.continuousLearning, note: "Açıkken kaynaklara internet isteği yapar." },
        { key: "Otomatik Öneri PR", enabled: !!s.autoProposePR, note: "GitHub'da yalnız dal açar; ana dala merge etmez." },
        { key: "GitHub yedek (öğrenilenler)", enabled: !!String(s.learningSyncRepo || "").trim(), note: "Açıksa öğrenilenleri belirttiğin repoya yazar." },
      ],
      runtime: {
        deviceName: s.remoteToolsDeviceName,
        trustedFolders: s.trustedFolders || [],
        toolPermissions: s.toolPermissions || {},
        providerChain: runtimePolicy.configuredProviderChain(s),
        mcp: lastMcpHealth,
      },
    };
  });

  ipcMain.handle("automations:status", async () => {
    const s = settingsStore.getSettings();
    const watchStatus = lastAgentWatch || agentWatch.status();
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
          key: "agentWatch",
          label: "GitHub Agent Watch",
          desc: "Claude, Codex, Gemini CLI ve seçili ajan depolarını izler; lisans kapılı bulguları yerel hafızaya alır.",
          enabled: !!s.agentWatch,
          last: watchStatus.lastScanAt ? {
            at: watchStatus.lastScanAt,
            info: `${watchStatus.healthySources}/${watchStatus.sourceCount} kaynak`,
          } : null,
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
        {
          key: "autonomousDevelopment",
          label: "Otonom Kod Geliştirme",
          desc: "Gözlenen tekrar eden sorunlarda seçilen repo dosyalarını okuyup güvenlik sınırları içinde taslak PR açar.",
          enabled: !!s.autonomousDevelopment,
          last: lastAutonomousDevelopment ? {
            at: lastAutonomousDevelopment.at,
            info: lastAutonomousDevelopment.ok ? `PR #${lastAutonomousDevelopment.number}` : "durduruldu",
          } : null,
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

  ipcMain.handle("development:run", async (_event, payload) => {
    const settings = settingsStore.getSettings();
    const permission = runtimePolicy.permissionDecision(settings, "autonomousDevelopment");
    if (permission.mode === "deny") {
      throw new Error("Otonom geliştirme güvenlik politikasıyla kapalı.");
    }
    if (!settings.autonomousDevelopment) {
      throw new Error("Önce Ayarlar bölümünden Otonom Kod Geliştirme'yi aç.");
    }
    const repository = String((payload && payload.repo) || settings.knowledgeRepo || "").trim();
    if (!repository) throw new Error("Hedef repo gerekli (owner/repo).");
    if (!githubClient.hasToken()) throw new Error("GitHub bağlantısı yapılandırılmamış.");
    const status = modelManager.getStatus ? modelManager.getStatus() : {};
    const model = (status && status.model) || DEFAULT_MODEL;
    const result = await autonomousDev.runAutonomousDevelopment({
      git: githubClient,
      repository,
      task: payload && payload.task,
      requestedPaths: payload && payload.paths,
      model,
      version: app.getVersion(),
      generate: (messages) => modelManager.generate(model, messages),
    });
    try { logs.info("development", `Taslak PR #${result.number}: ${result.title}`); } catch (_e) {}
    return result;
  });

  ipcMain.handle("improve:drafts", async () => improveDrafts.getDrafts());
  ipcMain.handle("improve:clearDrafts", async () => { improveDrafts.clearAll(); return true; });
  ipcMain.handle("improve:autoStatus", async () => lastAutoPropose);
  ipcMain.handle("development:status", async () => ({
    running: autonomousDevelopmentRunning,
    last: lastAutonomousDevelopment,
  }));
  ipcMain.handle("agent-watch:status", async () => lastAgentWatch || agentWatch.status());
  ipcMain.handle("agent-watch:scan", async () => runAgentWatch("manual"));

  ipcMain.handle("feedback:record", async (_event, payload) => {
    const data = feedback.record(payload || {});
    if (payload && payload.rating === "down") {
      try { improveDrafts.recordSignal({ kind: "negative_feedback" }); } catch (_e) {}
    }
    return data;
  });
  ipcMain.handle("feedback:stats", async () => feedback.stats());

  ipcMain.handle("system:analyze", async () => {
    // Temel (senkron) analiz her zaman çalışır
    const base = systemInfo.analyze(MODEL_OPTIONS);
    try {
      // GPU/VRAM bilgisiyle zenginleştirilmiş öneri (cookbook)
      const { MODEL_CATALOG } = require("../shared/constants");
      const catalog = MODEL_OPTIONS
        .map((o) => ({ ...o, ...(MODEL_CATALOG[o.id] || {}) }))
        .filter((o) => o.minVramGb);
      const ck = await systemInfo.analyzeCookbook(catalog);
      // Cookbook önerisi varsa onu kullan (VRAM-aware > RAM-only)
      if (ck.recommended) base.recommended = ck.recommended;
      base.vramGb  = ck.hardware.vramGb;
      base.gpuName = ck.hardware.gpuName;
    } catch (_e) { /* GPU okunamazsa sessizce geç, RAM-only öneri kalır */ }
    return base;
  });
  // Cookbook: donanımı tara, model uyum skoru + öneri üret, kurulu durumla birleştir.
  ipcMain.handle("cookbook:scan", async () => {
    const { MODEL_CATALOG } = require("../shared/constants");
    const catalog = MODEL_OPTIONS
      .map((o) => ({ ...o, ...(MODEL_CATALOG[o.id] || {}) }))
      .filter((o) => o.minVramGb); // yalnız katalog metadata'sı olanlar
    const ck = await systemInfo.analyzeCookbook(catalog);
    let installedIds = [];
    try {
      const { ollamaListModels } = require("./agent/ollama-client");
      const installed = await ollamaListModels();
      installedIds = (installed || [])
        .map((m) => (typeof m === "string" ? m : (m && (m.name || m.model || m.id)) || ""))
        .filter(Boolean);
    } catch (_e) {}
    const norm = (id) => String(id || "").toLowerCase();
    const isInstalled = (id) => installedIds.some((x) => norm(x) === norm(id) || norm(x) === `${norm(id)}:latest`);
    const settings = settingsStore.getSettings();
    const current = settings && settings.defaultModel ? settings.defaultModel : DEFAULT_MODEL;
    const models = ck.models.map((m) => ({ ...m, installed: isInstalled(m.id), isDefault: norm(m.id) === norm(current) }));
    return { hardware: ck.hardware, models, recommended: ck.recommended, defaultModel: current };
  });
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
    const permission = runtimePolicy.permissionDecision(settingsStore.getSettings(), "mcp");
    if (permission.mode === "deny") throw new Error("MCP güvenlik politikasıyla kapalı.");
    const url = (payload && payload.url) || "";
    if (!/^https?:\/\//i.test(url)) throw new Error("Geçerli bir http(s) URL gir.");
    return mcp.listTools(url);
  });
  ipcMain.handle("mcp:callTool", async (_event, payload) => {
    const mcp = require("./agent/mcp-client");
    const permission = runtimePolicy.permissionDecision(settingsStore.getSettings(), "mcp");
    if (permission.mode === "deny") throw new Error("MCP güvenlik politikasıyla kapalı.");
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
    const permission = runtimePolicy.permissionDecision(settingsStore.getSettings(), "codeExecution");
    if (permission.mode === "deny") {
      return { ok: false, stdout: "", stderr: "Kod çalıştırma güvenlik politikasıyla kapalı.", exitCode: -1 };
    }
    const lang = (payload && payload.language) || "";
    const code = (payload && payload.code) || "";
    if (!code.trim()) return { ok: false, stdout: "", stderr: "Kod boş.", exitCode: -1 };
    return runCode(lang, code, { timeoutMs: 15000 });
  });

  ipcMain.handle("provider:test", async (_event, payload) => {
    const { cloudTest, configFromSettings } = require("./agent/cloud-provider");
    const s = settingsStore.getSettings();
    return cloudTest(configFromSettings(s, payload || {}));
  });
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath("userData");
  // Hafıza ve ayarlar kullanıcının userData dizininde kalıcı olsun
  process.env.CODEGA_MEMORY_PATH =
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
  process.env.CODEGA_AGENT_WATCH_PATH =
    process.env.CODEGA_AGENT_WATCH_PATH || path.join(userDataPath, "agent-watch.json");
  const storage = await resolveModelStorage();
  process.env.CODEGA_MODELS_PATH = storage.path || path.join(userDataPath, "ollama-models");
  process.env.OLLAMA_MODELS = storage.path || process.env.CODEGA_MODELS_PATH;
  try { fs.mkdirSync(process.env.CODEGA_MODELS_PATH, { recursive: true }); } catch (_e) {}

  registerIpc();
  createWindow();
  updateService.start();
  await modelManager.detect();
  const installedAtStartup = await modelManager.installedModels();
  if (!installedAtStartup.length && storage.files > 0) {
    try {
      logs.warn("models", `Ollama boş depo kullanıyor; gerçek model diziniyle yeniden başlatılıyor: ${storage.path}`);
      await installer.restartOllama(storage.path);
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (await ollamaReachable()) break;
      }
      await modelManager.detect();
    } catch (error) {
      try { logs.error("models", `Model deposu otomatik düzeltilemedi: ${error.message || error}`); } catch (_e) {}
    }
  }

  // Kendi kendine bakım: açılışta bir kez + her 5 dakikada bir (güvenli, kod değiştirmez)
  runMaintenanceAutomations().catch(() => {});
  setInterval(() => { runMaintenanceAutomations().catch(() => {}); }, 5 * 60 * 1000);
  scheduleLearning();
  scheduleAgentWatch();
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
    if (s.scheduledTasksEnabled === false) return;
    if (!s.idleLearning) return;
    if (Date.now() - lastActivityAt < 2 * 60 * 1000) return; // 2 dk boşta değilse atla
    knowledge.syncUp().catch(() => {});
  }, 5 * 60 * 1000);

  // Kurulu Ollama modellerinin resmi manifestlerini günlük kontrol et.
  // Yalnız cihaz en az 5 dakika boşta kaldığında aynı model etiketi güncellenir.
  const maybeUpdateModels = async () => {
    const settings = settingsStore.getSettings();
    if (!settings || !settings.defaultModel) return;
    // Re-detect after setup to keep status current
    await modelManager.detect().catch(() => {});
  };
  try { await maybeUpdateModels(); } catch (_e) {}
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
