const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { APP_NAME, FEDERATION_BASE_URL } = require("../shared/constants");
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
      model,
    };
  });

  ipcMain.handle("chat:send", async (_event, message) => {
    lastActivityAt = Date.now();
    return modelManager.ask(message);
  });

  ipcMain.handle("chat:share", async (_event, chat) => {
    // Sondaki "/" önemli: "share" gerçek bir klasör; "/share" (slash yok) sunucuda
    // "/share/"a 301 yönlendirilir ve fetch redirect'i izlerken POST -> GET olur,
    // bu da url'siz yanıta yol açar. Trailing slash bunu engeller.
    const response = await fetch(`${FEDERATION_BASE_URL}/share/`, {
      method: "POST",
      redirect: "follow",
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
  });

  ipcMain.handle("models:list", async () => modelManager.getModels());

  ipcMain.handle("model:prepare", async (event, modelId) => {
    const status = await modelManager.prepareModel(modelId, (progress) => {
      event.sender.send("model:status", progress);
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
  ipcMain.handle("settings:set", async (_event, patch) => settingsStore.setSettings(patch));
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

  ipcMain.handle("rag:ingest", async (_event, payload) =>
    rag.addDocument(payload?.title || "Doküman", payload?.text || "", { source: "manual" })
  );
  ipcMain.handle("rag:stats", async () => rag.stats());
  ipcMain.handle("rag:clear", async () => rag.clearAll());

  ipcMain.handle("maintenance:run", async () => (await doMaintenance()) || { items: [], repairs: [], healthy: true });
  ipcMain.handle("maintenance:status", async () => lastMaintenance);

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
}

app.whenReady().then(async () => {
  // Hafıza ve ayarlar kullanıcının userData dizininde kalıcı olsun
  process.env.CODEGA_MEMORY_PATH =
    process.env.CODEGA_MEMORY_PATH || path.join(app.getPath("userData"), "memory.json");
  process.env.CODEGA_SETTINGS_PATH =
    process.env.CODEGA_SETTINGS_PATH || path.join(app.getPath("userData"), "agent-settings.json");
  process.env.CODEGA_RAG_PATH =
    process.env.CODEGA_RAG_PATH || path.join(app.getPath("userData"), "rag-store.json");
  process.env.CODEGA_IMPROVE_PATH =
    process.env.CODEGA_IMPROVE_PATH || path.join(app.getPath("userData"), "improve-drafts.json");

  registerIpc();
  createWindow();
  updateService.start();
  await modelManager.detect();

  // Kendi kendine bakım: açılışta bir kez + her 5 dakikada bir (güvenli, kod değiştirmez)
  doMaintenance().then(() => maybeAutoPropose()).catch(() => {});
  setInterval(() => { doMaintenance().then(() => maybeAutoPropose()).catch(() => {}); }, 5 * 60 * 1000);

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
