const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  MODEL_OPTIONS,
  OLLAMA_CHAT_TIMEOUT_MS,
  OLLAMA_COMMAND_TIMEOUT_MS,
  OLLAMA_DOWNLOAD_URL,
  OLLAMA_PULL_TIMEOUT_MS,
} = require("../shared/constants");
const { ollamaChat, ollamaChatStream, ollamaReachable, ollamaListModels } = require("./agent/ollama-client");
const { openaiChat, openaiChatStream } = require("./agent/openai-client");
const { runReact } = require("./agent/agent-loop");
const { TOOLS: AGENT_TOOLS } = require("./agent/tools");
const { buildSystemPrompt } = require("./agent/system-prompt");
const { getSettings } = require("./agent/settings-store");
const { recall, remember, extractDurableFacts } = require("./agent/memory");
const learningStore = require("./agent/learning-store");
const rag = require("./agent/rag");
const { reflect } = require("./agent/reflect");
const {
  runAdversarialReview,
  runCognitivePreflight,
  shouldRunCognitivePipeline,
} = require("./agent/cognitive-pipeline");
const {
  classifyReasoningProblem,
  enforceConclusion,
  shouldEnforceConclusion,
  shouldVerifyAnswer,
  verifyAnswer,
} = require("./agent/reasoning-guard");
const { shouldRunMLVC, solveDeterministic: solveDeterministicMathLogic, verifyMathLogic } = require("./agent/mlvc");
const ebse = require("./agent/ebse");
const rpre = require("./agent/rpre");
const hril = require("./agent/hril");
const ree = require("./agent/ree");
const tde = require("./agent/tde");
const finalAnswerSanitizer = require("./agent/final-answer-sanitizer");
const cognitiveKernel = require("./cognitive/kernel/cognitive-kernel");
const factLock = require("./agent/fact-lock");
const cvl = require("./agent/cvl");
const { repairBenchmarkAnswer, solveKnownReasoningBenchmarks } = require("./agent/benchmark-reasoner");
const { makePlan, looksLikeGoal } = require("./agent/planner");
const { runOrchestrated } = require("./agent/orchestrator");
const { SPECIALISTS, routeStep, buildSpecialistPrompt } = require("./agent/agents");
const improveDrafts = require("./agent/improve-drafts");
const experts = require("./agent/experts");

// Basit sohbet/selamlaşma tespiti — bunlarda araç/ReAct makinesi devreye girmesin
function _normTr(s) {
  return String(s || "").toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}
const SMALLTALK_RE = /^(selam|merhaba|merhabalar|gunaydin|iyi gunler|iyi geceler|iyi aksamlar|naber|nasilsin|tesekkur|tesekkurler|sagol|sag ol|eyvallah|gorusuruz|hosca kal|hello|hi|hey|thanks|tesekkur ederim)\b/;
function isSmallTalk(input) {
  const t = String(input || "").trim();
  if (!t || t.length > 25 || /\?/.test(t)) return false;
  if (t.split(/\s+/).length > 4) return false; // selam+istek olmasın
  return SMALLTALK_RE.test(_normTr(t));
}
function smallTalkPrompt(humanTone) {
  return (
    "Sen CODEGA AI'sın, yerel çalışan bir yapay zeka asistanısın. Kullanıcı seninle kısa bir " +
    "selamlaşma/sohbet yapıyor. Kısa, doğal ve net Türkçe cevap ver: 1-2 cümle. Araç KULLANMA, " +
    "liste yapma, kendini uzun uzun tanıtma, rapor/etiket yazma." +
    (humanTone ? " Sıcak ve içten bir ton kullan." : "")
  );
}

const MAX_HISTORY_MESSAGES = 12; // son ~6 turu hatırla

const READY_STATES = {
  CHECKING: "checking",
  READY: "ready",
  MISSING: "missing",
  ERROR: "error",
};

const TASK_MODELS = {
  code: ["qwen2.5-coder:3b-instruct", "qwen2.5-coder:7b-instruct", "qwen3:8b", DEFAULT_MODEL],
  image: ["qwen2.5:3b", "gemma3:4b", "qwen3:8b", DEFAULT_MODEL],
  writing: ["qwen3:4b", "qwen2.5:3b", "qwen3:8b", "mistral:7b", DEFAULT_MODEL],
  chat: [DEFAULT_MODEL, "qwen2.5:1.5b", "llama3.2:3b"],
};

function instantAnswer(input) {
  const text = String(input || "").trim().toLowerCase();
  if (!text) return "";

  if (/^(merhaba|selam|hi|hello|hey|günaydın|iyi\s+(akşam|akşamlar|gece|geceler)|nasılsın|naber)\b/.test(text)) {
    if (text.includes("günaydın")) return "Günaydın. Buradayım, nasıl yardımcı olayım?";
    if (text.includes("iyi gece")) return "İyi geceler. Buradayım, nasıl yardımcı olayım?";
    if (text.includes("iyi akşam")) return "İyi akşamlar. Buradayım, nasıl yardımcı olayım?";
    if (text.includes("nasılsın") || text.includes("naber")) {
      return "İyiyim, teşekkür ederim. Ne yapmak istiyorsun?";
    }
    return "Merhaba. Buradayım, nasıl yardımcı olayım?";
  }

  if (/(kendin(den|i)|kim(sin)?|neler\s+yapabilirsin|özelliklerin|yeteneklerin|codega\s+ai)\b/.test(text)) {
    return "Ben CODEGA AI. İsteğine göre uygun yerel modeli otomatik seçen, kod, araştırma, proje planlama ve günlük üretim işlerinde yardımcı olan kişisel yapay zeka asistanınım.";
  }

  return "";
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const { onData, timeoutMs = OLLAMA_COMMAND_TIMEOUT_MS, ...spawnOptions } = options;
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      ...spawnOptions,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeoutTimer = null;
    let forceTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceTimer) clearTimeout(forceTimer);
      resolve(result);
    };

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        stderr += `\nKomut ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`;
        child.kill();
        forceTimer = setTimeout(() => {
          finish({
            ok: false,
            stdout,
            stderr,
            timedOut: true,
            error: "Ollama süreci zaman aşımından sonra kapatılamadı.",
          });
        }, 2000);
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onData?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onData?.(text);
    });
    child.on("error", (error) => {
      finish({ ok: false, stdout, stderr, error: error.message, timedOut });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0 && !timedOut,
        code,
        stdout,
        stderr,
        timedOut,
        error: timedOut ? "Ollama yanıtı zaman aşımına uğradı." : undefined,
      });
    });
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function existingFile(value) {
  try {
    return value && fs.existsSync(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

function ollamaCandidates() {
  const env = process.env;
  const home = os.homedir();
  const executable = process.platform === "win32" ? "ollama.exe" : "ollama";
  const pathEntries = String(env.PATH || "")
    .split(path.delimiter)
    .map((entry) => path.join(entry, executable));

  return unique([
    "ollama",
    existingFile(env.OLLAMA_EXE),
    existingFile(env.OLLAMA_PATH),
    existingFile(path.join(env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe")),
    existingFile(path.join(home || "", "AppData", "Local", "Programs", "Ollama", "ollama.exe")),
    existingFile(path.join(env.PROGRAMFILES || "", "Ollama", "ollama.exe")),
    existingFile(path.join(env["PROGRAMFILES(X86)"] || "", "Ollama", "ollama.exe")),
    existingFile("/usr/local/bin/ollama"),
    existingFile("/opt/homebrew/bin/ollama"),
    ...pathEntries.map(existingFile),
  ]);
}

function modelCandidates() {
  return unique([DEFAULT_MODEL, ...FALLBACK_MODELS]);
}

function modelOption(modelId) {
  return MODEL_OPTIONS.find((model) => model.id === modelId) || {
    id: modelId,
    label: modelId,
    description: "Özel model",
    task: "custom",
  };
}

function parseInstalledModels(listOutput) {
  return String(listOutput || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function hasModel(listOutput, model) {
  const wanted = model.toLowerCase();
  return String(listOutput || "")
    .toLowerCase()
    .split(/\r?\n/)
    .some((line) => line.split(/\s+/)[0] === wanted);
}

function _foldTr(text) {
  return String(text || "").toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}

/** Açık internet/araştırma niyeti mi? (zayıf yerel model aracı tetikleyemiyor; biz zorlarız) */
function wantsWebResearch(input) {
  const q = _foldTr(input);
  if (/(internet|web|google|cevrimici|online|net)\S*\s*(ten|te|de|da|den|dan)?\s*(arastir|aratip|arat|ara|bak|tara|incele)/.test(q)) return true;
  if (/(guncel|son dakika|haber|piyasa|kur|fiyat|bugun)\S*.*(arastir|ara\b|bul\b|bak\b)/.test(q)) return true;
  // kısa ve emir kipi "araştır/araştırıp özetle"
  if (/\barastir/.test(q) && q.split(/\s+/).length <= 9) return true;
  return false;
}

/** Araştırma sorgusunu çıkar: komut sözcüklerini at; yetersizse geçmişten konuyu ekle. */
function extractResearchQuery(input, history = []) {
  let q = String(input || "")
    .replace(/internetten|internette|internet|web'?[dt]e|web|google'?[dy]?[ae]?|google|cevrimici|online/gi, " ")
    .replace(/arastirip|arastir(ip|in|sana)?|aratip|aratarak|arat|incele(yip)?|tara(yip)?|bak(ip)?\b/gi, " ")
    .replace(/\bara\b|\bbul\b|\bver\b|o zaman|bana|bize|lutfen|ozet(le|ini|le bana)?|sonra/gi, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ").trim();
  const meaningful = q.split(/\s+/).filter((w) => w.length > 1);
  if (meaningful.length >= 3) return q;
  // yetersiz konu: en son anlamlı kullanıcı mesajını ekle (bağlam)
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] && history[i].role === "user") {
      const h = String(history[i].content || "").replace(/\s+/g, " ").trim();
      if (h && h.length > 4) return (q ? q + " " : "") + h.slice(0, 140);
    }
  }
  return q || String(input || "").slice(0, 140);
}

function detectTask(input) {
  const text = String(input || "").toLowerCase();
  if (/(php|python|javascript|typescript|react|node|api|site|web sitesi|program|uygulama|kod|script|fonksiyon|class|sql|html|css)\b/.test(text)) {
    return "code";
  }
  if (/(resim|görsel|fotoğraf|çiz|çizim|afiş|logo|illustrasyon|illustration|image|prompt)\b/.test(text)) {
    return "image";
  }
  if (/(makale|metin|içerik|mail|e-posta|özet|rapor|senaryo|hikaye|plan)\b/.test(text)) {
    return "writing";
  }
  return "chat";
}

function chooseModelForTask(task, installed) {
  const installedSet = new Set(installed);
  const preferred = TASK_MODELS[task] || TASK_MODELS.chat;
  return preferred.find((model) => installedSet.has(model))
    || modelCandidates().find((model) => installedSet.has(model))
    || preferred[0]
    || DEFAULT_MODEL;
}

function candidateModelsForTask(task, installed) {
  const installedSet = new Set(installed);
  const preferred = TASK_MODELS[task] || TASK_MODELS.chat;
  return unique([
    ...preferred,
    DEFAULT_MODEL,
    "qwen2.5:1.5b",
    "llama3.2:3b",
    ...modelCandidates(),
  ]).filter((model) => installedSet.has(model));
}

function buildPrompt(task, input) {
  return [
    "Sen CODEGA AI'sın. Türkçe, net, samimi ve uygulanabilir cevap ver.",
    "ChatGPT ve Claude kalitesinde davran: talebi anla, gerekirse kısa plan yap, sonra doğrudan faydalı cevabı ver.",
    "İç model/paket adlarını kullanıcıya söyleme; sadece doğal şekilde yanıt ver.",
    "Yanıtı gereksiz uzatma. Önce sonucu ver, sonra gerekiyorsa kısa açıklama ekle.",
    `Görev türü: ${task}`,
    `Kullanıcı: ${input}`,
    "CODEGA AI:",
  ].join("\n");
}

function parseSizeToBytes(value, unit) {
  const n = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const u = String(unit || "").toLowerCase();
  if (u.startsWith("kb")) return n * 1024;
  if (u.startsWith("mb")) return n * 1024 * 1024;
  if (u.startsWith("gb")) return n * 1024 * 1024 * 1024;
  if (u.startsWith("tb")) return n * 1024 * 1024 * 1024 * 1024;
  return n;
}

function parsePullProgress(line) {
  const text = String(line || "").replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const percentMatch = text.match(/(\d{1,3})\s*%/);
  const sizeMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)/i);
  const speedMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)\/s/i);
  const progress = {
    raw: text,
    percent: percentMatch ? Math.max(0, Math.min(100, Number(percentMatch[1]))) : null,
    downloadedBytes: null,
    totalBytes: null,
    speedBytesPerSec: null,
  };
  if (sizeMatch) {
    progress.downloadedBytes = parseSizeToBytes(sizeMatch[1], sizeMatch[2]);
    progress.totalBytes = parseSizeToBytes(sizeMatch[3], sizeMatch[4]);
    if (progress.percent === null && progress.downloadedBytes !== null && progress.totalBytes) {
      progress.percent = Math.max(0, Math.min(100, (progress.downloadedBytes / progress.totalBytes) * 100));
    }
  }
  if (speedMatch) progress.speedBytesPerSec = parseSizeToBytes(speedMatch[1], speedMatch[2]);
  return progress;
}

function missingModelReply(task, modelId, started) {
  const subject = task === "code" ? "kod/PHP işleri" : "bu iş";
  const action = started ? "arka planda hazırlamaya başladım" : "arka planda hazırlıyorum";
  if (task === "code") {
    return [
      `PHP yazılım için gerekli yerel kod modelini (${modelId}) ${action}.`,
      "İndirme bitince otomatik kullanacağım; ayrıca Ayarlar'a gitmene gerek yok.",
      "",
      "Bu sırada ihtiyacını netleştirebiliriz: web sitesi mi, panel/ERP modülü mü, API mi, yoksa mevcut PHP projesinde hata/ek geliştirme mi istiyorsun?",
    ].join("\n");
  }
  return `${subject} için gerekli yerel modeli (${modelId}) ${action}. Hazır olunca otomatik kullanacağım; ayrıca Ayarlar'a gitmene gerek yok.`;
}

// HTTP /api/chat erişilemezse, CLI `ollama run` için messages dizisini tek
// prompt'a düzleştir (system + geçmiş + kullanıcı korunur).
function flattenMessages(messages) {
  const label = { system: "[SISTEM]", user: "[KULLANICI]", assistant: "[CODEGA]" };
  const lines = messages.map((m) => `${label[m.role] || m.role}: ${m.content}`);
  lines.push("[CODEGA]:");
  return lines.join("\n\n");
}

class ModelManager {
  constructor() {
    this.ollamaCommand = null;
    this.history = []; // sunucu-tarafı çok-turlu hafıza ({role, content})
    this._abort = null; // mevcut üretimi durdurmak için
    this._aborted = false;
    this._queue = Promise.resolve(); // ask() serileştirme kuyruğu
    this._preparingModels = new Set(); // arka planda aynı modeli iki kez indirme
    this.state = {
      provider: "instant",
      status: READY_STATES.CHECKING,
      model: DEFAULT_MODEL,
      task: "chat",
      message: "Model durumu kontrol ediliyor",
    };
  }

  async runOllama(args, options = {}) {
    const candidates = this.ollamaCommand ? [this.ollamaCommand] : ollamaCandidates();
    let lastResult = null;
    for (const candidate of candidates) {
      const result = await runCommand(candidate, args, options);
      if (result.ok) {
        this.ollamaCommand = candidate;
        return result;
      }
      lastResult = result;
    }
    return lastResult || { ok: false, error: "Ollama çalıştırılamadı" };
  }

  getStatus() {
    return { ...this.state };
  }

  async installedModels() {
    // HTTP /api/tags — CLI/PATH'ten bağımsız (Electron'da güvenilir)
    const viaHttp = await ollamaListModels();
    if (Array.isArray(viaHttp)) return viaHttp;
    const models = await this.runOllama(["list"]);
    return models.ok ? parseInstalledModels(models.stdout) : [];
  }

  async detect() {
    this.state = {
      ...this.state,
      status: READY_STATES.CHECKING,
      message: "Ollama aranıyor",
    };

    // Önce HTTP servisi (127.0.0.1:11434) — Electron PATH'i CLI'ı görmese bile
    // servis ayaktaysa Ollama KURULU sayılır. CLI sadece yedek kontrol.
    const reachable = await ollamaReachable();
    let cliOk = false;
    if (!reachable) {
      const version = await this.runOllama(["--version"]);
      cliOk = version.ok;
    }
    if (!reachable && !cliOk) {
      this.state = {
        provider: "instant",
        status: READY_STATES.MISSING,
        model: DEFAULT_MODEL,
        task: "chat",
        message: "Ollama bulunamadı. CODEGA AI temel modda hazır; yerel modeller için Ollama kurulmalı.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
      return this.getStatus();
    }

    const installed = await this.installedModels();
    const installedModel = modelCandidates().find((model) => installed.includes(model));
    const option = modelOption(installedModel || DEFAULT_MODEL);
    this.state = {
      provider: "ollama",
      status: installedModel ? READY_STATES.READY : READY_STATES.MISSING,
      model: installedModel || DEFAULT_MODEL,
      task: option.task || "chat",
      message: installedModel
        ? "Codega AI hazır."
        : "Önerilen modeller indirilmeli. Ayarlardan model paketlerini hazırlayabilirsin.",
    };
    return this.getStatus();
  }

  async getModels() {
    await this.detect();
    const installed = await this.installedModels();
    return {
      installed,
      options: MODEL_OPTIONS.map((model) => ({
        ...model,
        installed: installed.includes(model.id),
      })),
      status: this.getStatus(),
    };
  }

  async prepareModel(modelId, onProgress) {
    const target = modelOption(modelId || DEFAULT_MODEL);
    await this.detect();
    if (this.state.provider !== "ollama") {
      return {
        ...this.getStatus(),
        model: target.id,
        message: "Ollama kurulu değil. Modeli hazırlamak için önce Ollama kurulumu açılıyor.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
    }

    const installed = await this.installedModels();
    if (installed.includes(target.id)) {
      this.state = {
        provider: "ollama",
        status: READY_STATES.READY,
        model: target.id,
        task: target.task || "chat",
        message: "Codega AI hazır.",
      };
      return this.getStatus();
    }

    this.state = {
      ...this.state,
      model: target.id,
      task: target.task || "chat",
      status: READY_STATES.CHECKING,
      message: `${target.label} indiriliyor`,
      progress: {
        raw: "",
        percent: 0,
        downloadedBytes: null,
        totalBytes: null,
        speedBytesPerSec: null,
      },
    };
    onProgress?.(this.getStatus());

    const result = await this.runOllama(["pull", target.id], {
      timeoutMs: OLLAMA_PULL_TIMEOUT_MS,
      onData: (chunk) => {
        const progress = parsePullProgress(chunk);
        if (!progress) return;
        const percentText = progress.percent !== null ? ` %${Math.round(progress.percent)}` : "";
        this.state = {
          ...this.state,
          message: `${target.label} indiriliyor${percentText}`,
          progress,
        };
        onProgress?.(this.getStatus());
      },
    });
    if (!result.ok) {
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: result.stderr || result.error || `${target.label} indirilemedi`,
      };
      return this.getStatus();
    }

    this.state = {
      provider: "ollama",
      status: READY_STATES.READY,
      model: target.id,
      task: target.task || "chat",
      message: "Codega AI hazır.",
      progress: {
        raw: "completed",
        percent: 100,
        downloadedBytes: null,
        totalBytes: null,
        speedBytesPerSec: null,
      },
    };
    return this.getStatus();
  }

  async prepareDefaultModel(onProgress) {
    return this.prepareModel(DEFAULT_MODEL, onProgress);
  }

  prepareModelInBackground(modelId) {
    const target = modelOption(modelId || DEFAULT_MODEL).id;
    if (this._preparingModels.has(target)) return false;
    this._preparingModels.add(target);
    this.prepareModel(target).catch(() => {}).finally(() => {
      this._preparingModels.delete(target);
    });
    return true;
  }

  // Aynı anda gelen mesajları SIRAYA al: yerel model tek seferde tek üretim
  // yapsın (eşzamanlı istekler küçük modeli tıkar ve "Düşünüyorum"da bırakır).
  /** Mevcut üretimi durdur (kullanıcı tetikli). */
  abortCurrent() {
    if (this._abort) {
      this._aborted = true;
      try { this._abort.abort(); } catch (_e) {}
      return true;
    }
    return false;
  }

  ask(input, opts = {}) {
    const run = () => this._ask(input, opts);
    const result = this._queue.then(run, run);
    this._queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async _ask(input, opts = {}) {
    const _t0 = Date.now();
    const reasoningCategories = classifyReasoningProblem(input);
    const inputNeedsVerification = shouldVerifyAnswer(input);
    const inputNeedsConclusion = shouldEnforceConclusion(input);
    const inputNeedsMLVC = shouldRunMLVC(input);
    const deepReasoning = getSettings().deepReasoning === true; // ağır çok-turlu LLM doğrulaması (opt-in, varsayılan KAPALI)
    const cognitiveContextState = cognitiveKernel.createContext(input, {
      flags: {
        deepReasoning,
        inputNeedsConclusion,
        inputNeedsMLVC,
        inputNeedsVerification,
      },
    });
    const cognitiveIntake = cognitiveKernel.runIntake(cognitiveContextState);
    const taskDecomposition = cognitiveIntake.taskReport;
    const inputNeedsCognitivePipeline = deepReasoning && shouldRunCognitivePipeline(input) && !inputNeedsMLVC;
    // Akış yalnızca (opt-in) bilişsel hat çalışırken kapanır. Aksi halde cevap token token
    // akar — kullanıcı "düşünüyorum"da DONMAZ. Doğrulama/sonuç turları akışı engellemez.
    const onToken = inputNeedsCognitivePipeline ? null : (opts.onToken || null);
    // Yeniden üretim: önceki turu (user+assistant) geçmişten çıkar ki bağlam tekrarlanmasın
    if (opts.regenerate) {
      if (this.history.length && this.history[this.history.length - 1].role === "assistant") this.history.pop();
      if (this.history.length && this.history[this.history.length - 1].role === "user") this.history.pop();
    }
    // ÇOK-GÖREV ÖNCELİĞİ: girdi birden çok görev içeriyorsa, anlık tek-cevap kısa-devreleri
    // (instant/benchmark/MLVC) ATLA. Aksi halde MLVC tüm metni tek soru sanıp "1000 | 2" gibi
    // tek/anonim cevapla kısa devre yapıp çok-görev dalını HİÇ çalıştırmıyordu (kök neden).
    const isMultiTaskInput = taskDecomposition.applicable && taskDecomposition.count >= 2;
    const isInstructionOnlyMainTask = taskDecomposition.instructionOnly && taskDecomposition.mainTask;

    if (!isMultiTaskInput && isInstructionOnlyMainTask) {
      const mainTaskAnswer = rpre.solveMainTask(taskDecomposition.mainTask.problem_text || input);
      if (mainTaskAnswer) {
        return {
          provider: "instant",
          model: "codega-main-task-solver",
          text: mainTaskAnswer,
        };
      }
    }

    const instant = !isMultiTaskInput && instantAnswer(input);
    if (instant) {
      return {
        provider: "instant",
        model: "codega-instant",
        text: instant,
      };
    }
    const benchmarkInstant = !isMultiTaskInput && solveKnownReasoningBenchmarks(input);
    if (benchmarkInstant) {
      return {
        provider: "instant",
        model: "codega-benchmark-reasoner",
        text: benchmarkInstant,
      };
    }
    const mlvcInstant = !isMultiTaskInput && solveDeterministicMathLogic(input);
    if (mlvcInstant) {
      const interpreted = hril.interpret(input, mlvcInstant);
      const explained = ree.explain(input, interpreted.answer || mlvcInstant);
      return {
        provider: "instant",
        model: "codega-mlvc",
        text: explained.answer || interpreted.answer || mlvcInstant,
      };
    }

    const settings = getSettings();
    const cloudMode =
      settings.provider === "openai" && String(settings.openaiApiKey || "").trim().length > 0;

    const task = detectTask(input);
    let attemptModels;
    let selectedModel;

    if (cloudMode) {
      // Bulut: Ollama'ya gerek yok; kullanıcının seçtiği modeli kullan.
      selectedModel = settings.openaiModel || "gpt-4o-mini";
      attemptModels = [selectedModel];
      this.state = {
        provider: "openai",
        status: READY_STATES.READY,
        model: selectedModel,
        task,
        message: "Düşünüyorum...",
      };
    } else {
      if (this.state.provider !== "ollama") {
        await this.detect();
      }
      if (this.state.provider !== "ollama") {
        return {
          provider: "instant",
          model: "codega-setup",
          text: "Yerel zeka motoru hazır değil. Ayarlardan kurulumu başlatıp önerilen zeka paketlerini indirebilirsin. (Alternatif: Zekâ & Model'den bulut sağlayıcı tanımlayabilirsin.)",
        };
      }

      const installed = await this.installedModels();
      attemptModels = candidateModelsForTask(task, installed);
      selectedModel = attemptModels[0] || chooseModelForTask(task, installed);
      if (!attemptModels.length) {
        const started = this.prepareModelInBackground(selectedModel);
        this.state = {
          provider: "ollama",
          status: READY_STATES.CHECKING,
          model: selectedModel,
          task,
          message: `${selectedModel} arka planda hazırlanıyor.`,
        };
        return {
          provider: "instant",
          model: "codega-model-router",
          text: missingModelReply(task, selectedModel, started),
        };
      }

      this.state = {
        provider: "ollama",
        status: READY_STATES.READY,
        model: selectedModel,
        task,
        message: "Düşünüyorum...",
      };
    }

    // Otonom öğrenme: kullanıcı hakkında hatırladıklarını system prompt'a kat
    const memory = settings.autonomousLearning ? recall(input, 4) : [];

    // RAG: eklenen doküman/bilgi tabanından alakalı parçaları getir
    let ragContext = [];
    if (settings.ragEnabled) {
      try {
        const hits = await rag.search(input, 4);
        ragContext = hits.map((h) => `[${h.title}] ${h.text}`);
      } catch (_e) {
        ragContext = [];
      }
    }

    // Otonom öğrenmeyle toplanan bilgiyi cevaba kat ("kör olma" / hızlandır)
    let learnedContext = [];
    if (settings.continuousLearning || settings.autonomousLearning) {
      try {
        let hits = [];
        if (settings.semanticSearch) {
          const emb = require("./agent/embeddings");
          const qv = await emb.embed(input, { model: settings.embedModel || emb.DEFAULT_EMBED_MODEL });
          if (qv) hits = learningStore.searchSemantic(qv, 3);
        }
        if (!hits.length) hits = learningStore.searchLearned(input, 3); // anlamsal yoksa anahtar-kelime
        learnedContext = hits.map((n) => `[${n.source}] ${n.topic}: ${n.text}${n.url ? ` (${n.url})` : ""}`);
      } catch (_e) {
        learnedContext = [];
      }
    }

    // Hedef-odaklı planlama (opt-in): karmaşık hedefi alt adımlara böl
    const cognitivePreflight = inputNeedsCognitivePipeline
      ? await runCognitivePreflight(
        input,
        (msgs) => this.generate(selectedModel, msgs, attemptModels),
        { cycles: 2 }
      )
      : { ok: true, skipped: true, report: null, context: "" };
    const cognitiveContext = cognitivePreflight.context || "";

    let plan = [];
    if (settings.planner && looksLikeGoal(input)) {
      try {
        const plannerInput = cognitiveContext
          ? `${cognitiveContext}\n\nOriginal user request:\n${input}`
          : input;
        plan = await makePlan(plannerInput, (msgs) => this.generate(selectedModel, msgs));
      } catch (_e) {
        plan = [];
      }
    }

    // Mesaj dizisi: system (karakter + hafıza + RAG + plan + araç protokolü) + geçmiş + kullanıcı
    const messages = [
      {
        role: "system",
        content: buildSystemPrompt(task, {
          memory,
          humanTone: settings.humanTone,
          ragContext,
          plan,
          expertPersona: experts.personaFor(settings.expertMode),
          projectContext: opts.context || "",
          learnedContext,
        }),
      },
      ...(cognitiveIntake.messages || []),
      ...(cognitiveContext ? [{ role: "system", content: cognitiveContext }] : []),
      ...this.history,
      { role: "user", content: input },
    ];

    const generateFn = (msgs) => this.generate(selectedModel, msgs, attemptModels);

    // Durdurulabilirlik: bu üretim turu için yeni bir abort kontrolcüsü
    this._abort = new AbortController();
    this._aborted = false;

    let agent;
    try {
      if (!cloudMode && wantsWebResearch(input)) {
        // ZORUNLU ARAŞTIRMA: zayıf yerel model aracı tetikleyemiyor → biz çalıştırırız.
        // Kullanıcıya "sen Google'a bak" DEMEK yerine gerçekten arar ve özetleriz.
        const query = extractResearchQuery(input, this.history);
        if (onToken) onToken(`🔎 İnternette araştırıyorum: "${query}"…\n\n`);
        let research = "";
        try {
          research = await AGENT_TOOLS.research.fn(query, 3);
        } catch (e) {
          research = `⚠️ ${e && (e.message || e)}`;
        }
        if (/^⚠️|kaynak bulunamadı/i.test(research)) {
          agent = {
            content:
              `İnternet araması yapamadım ya da kaynak bulunamadı (internet bağlantısı veya erişim engeli olabilir). ` +
              `Aradığım konu: "${query}". Ollama/ağ erişimini kontrol edip tekrar deneyebilirsin.`,
            iterations: 0, stoppedReason: "research_failed", toolCalls: [{ name: "research", result: research }],
          };
        } else {
          const sumMsgs = [
            {
              role: "system",
              content:
                "Aşağıda internetten TOPLADIĞIN web kaynakları var. Bunları KENDİ SÖZCÜKLERİNLE, Türkçe, " +
                "derli toplu özetle. Kullanıcıya 'sen ara/Google'a bak' ASLA deme — araştırmayı SEN yaptın. " +
                "Önemli noktaları maddele, varsa çelişkileri belirt ve sonunda kaynak linklerini listele. " +
                "Kaynaklarda yoksa uydurma; bilmiyorsan söyle.",
            },
            { role: "user", content: research },
          ];
          const summary = await this.generate(selectedModel, sumMsgs, attemptModels, onToken);
          agent = {
            content: String(summary || "").trim() || research,
            iterations: 1, stoppedReason: "final_answer",
            toolCalls: [{ name: "research", result: research }],
          };
        }
      } else if (!cloudMode && taskDecomposition.applicable && taskDecomposition.count >= 2) {
        // ÇOK-GÖREV: zayıf yerel model 5 görevi tek seferde çözemiyordu (1 cevap dönüyordu).
        // Her görevi BAĞIMSIZ çöz, task_results[]'e doldur, finali TÜM diziden kur.
        const detectedTasks = taskDecomposition.tasks;
        const taskResults = [];
        for (let i = 0; i < detectedTasks.length; i++) {
          const t = detectedTasks[i];
          if (onToken) onToken(`\n\n### ${t.label}\n`);
          const taskFactLock = factLock.extractFacts(t.body);
          const tMsgs = [
            {
              role: "system",
              content:
                "Sana TEK bir görev verilecek. SADECE bu görevi çöz. Adım adım, kısa ve net düşün; " +
                "sonunda mutlaka 'Cevap: …' satırı yaz. Başka görevlere değinme, soruyu tekrar etme.",
            },
            ...(taskFactLock.applicable ? [{ role: "system", content: factLock.formatFactLockContext(taskFactLock) }] : []),
            { role: "user", content: t.body },
          ];
          let aTxt = "";
          try {
            aTxt = String(await this.generate(selectedModel, tMsgs, attemptModels, onToken) || "").trim();
          } catch (_e) { aTxt = ""; }
          // Görev başına ucuz deterministik düzeltme (oran/denklem/matematik)
          try {
            const rp = rpre.verify(t.body, aTxt);
            if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) aTxt = rp.correctedAnswer;
            const eb = ebse.verify(t.body, aTxt);
            if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) aTxt = eb.correctedAnswer;
          } catch (_e) { /* doğrulama görevi düşürmesin */ }
          if (!aTxt) aTxt = "(bu görev için yanıt üretilemedi)";
          // Sonucu diziye PUSH et — önceki sonuçların üzerine YAZMA
          taskResults.push({ label: t.label, answer: aTxt });
        }
        // Final yanıt TÜM task_results dizisinden kurulur (yalnız son/aktif görev değil)
        const assembled = taskResults.map((r) => `**${r.label}**\n${r.answer}`).join("\n\n");
        const complete = taskResults.length === detectedTasks.length;
        agent = {
          content: complete
            ? assembled
            : `${assembled}\n\n⚠️ ${detectedTasks.length} görev algılandı ama ${taskResults.length} tanesi yanıtlandı.`,
          iterations: detectedTasks.length,
          stoppedReason: "multi_task",
          toolCalls: [],
        };
      } else if (isSmallTalk(input)) {
        // Basit selam/sohbet: araçsız, kısa, doğrudan cevap (ajan saçmalamasın)
        const sttMsgs = [
          { role: "system", content: smallTalkPrompt(settings.humanTone) },
          ...this.history.slice(-4),
          { role: "user", content: input },
        ];
        const direct = await this.generate(selectedModel, sttMsgs, attemptModels, onToken);
        agent = { content: direct, iterations: 0, stoppedReason: "smalltalk", toolCalls: [] };
      } else if (settings.multiAgent && looksLikeGoal(input)) {
        // Multi-agent: orchestrator → uzman ajanlar → denetçi sentezi
        const gen = (msgs) => this.generate(selectedModel, msgs);
        const orch = await runOrchestrated(input, {
          makePlan: (g) => makePlan(g, gen),
          routeStep,
          runSpecialist: async (key, taskText, g) => {
            const msgs = [
              { role: "system", content: buildSpecialistPrompt(key, g) },
              { role: "user", content: taskText },
            ];
            const r = await runReact(msgs, gen, {
              maxIters: 2,
              allowedTools: (SPECIALISTS[key] || SPECIALISTS.generalist).tools,
            });
            return r.content;
          },
          synthesize: async (g, stepResults) => {
            const joined = stepResults
              .map((r, i) => `Adım ${i + 1} (${r.specialist}): ${r.output}`)
              .join("\n\n");
            const msgs = [
              {
                role: "system",
                content:
                  buildSpecialistPrompt("reviewer", g) +
                  "\nTüm adım çıktılarını birleştirip kullanıcıya tek, net bir final cevap yaz.",
              },
              {
                role: "user",
                content: `Hedef: ${g}\n\nAdım çıktıları:\n${joined}\n\nFinal cevabı yaz.`,
              },
            ];
            return await gen(msgs);
          },
        });
        agent = {
          content: orch.content,
          iterations: orch.plan.length,
          stoppedReason: "final_answer",
          toolCalls: [],
        };
      } else {
        // Varsayılan yol: cevabı akışlı üret (token token). Akış bozulursa generate
        // kendi içinde bloklayıcı moda/CLI'ye düşer; dönüş değeri yine otorite.
        const streamFn = (msgs) => this.generate(selectedModel, msgs, attemptModels, onToken);
        agent = await runReact(messages, streamFn, { maxIters: 3 });
      }
    } catch (e) {
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: (e && e.message) || "Ajan hatası",
      };
      return {
        provider: "instant",
        model: "codega-error",
        text: "Yerel zeka motoru şu an yanıt üretemedi. Ollama açık mı ve model indirildi mi diye kontrol edebilirsin.",
      };
    }

    const text = String(agent.content || "").trim();
    // Kullanıcı durdurduysa: o ana dek üretilen kısmı (varsa) döndür, yoksa not düş
    if (this._aborted) {
      this._abort = null;
      this.state = { ...this.state, status: READY_STATES.READY, message: "Durduruldu" };
      return {
        provider: this.state.provider || "ollama",
        model: selectedModel,
        text: text ? `${text}\n\n⏹️ (durduruldu)` : "⏹️ Üretim durduruldu.",
      };
    }
    // Kendini gözlemleme: araç hatalarını öneri taslağı için say (yerel, gönderilmez)
    try {
      for (const tc of agent.toolCalls || []) {
        if (typeof tc.result === "string" && /⚠️\s*Araç hatası|not_allowed/.test(tc.result)) {
          improveDrafts.recordSignal({ kind: "tool_error", subject: tc.name });
        }
      }
    } catch (_e) { /* gözlem hatası akışı bozmasın */ }
    if (!text || agent.stoppedReason === "error") {
      try { improveDrafts.recordSignal({ kind: "empty_response" }); } catch (_e) {}
      this.state = {
        ...this.state,
        status: READY_STATES.READY,
        message: text ? "Hazır" : "Yanıt boş döndü",
      };
      return {
        provider: "instant",
        model: "codega-empty",
        text:
          text ||
          "Yanıt üretemedim. Ollama servisi açık mı ve ilgili model indirildi mi diye kontrol edebilirsin.",
      };
    }

    // Öz değerlendirme (opt-in): cevabı denetle, gerekiyorsa düzelt
    let finalText = text;
    const applyCorrection = (candidate, source) => {
      const check = cvl.validateCorrection(input, finalText, candidate, { source });
      if (!check.accepted) {
        try { improveDrafts.recordSignal({ kind: "cvl_reject", subject: check.errors[0] || source }); } catch (_e) {}
        return false;
      }
      finalText = check.answer;
      return true;
    };
    // multi_task: etiketli görev birleştirmesi (Görev N: cevap) korunmalı. Aşağıdaki
    // dönüştürücü motorlar (HRIL/REE/sanitizer/kernel) "Final Answer" çıkarıp etiketleri
    // silebiliyor ("2 | 12" gibi anonim çıktı). Bu modda onları atlar, sonda geri yükleriz.
    const isMultiTask = agent.stoppedReason === "multi_task";
    const multiTaskAssembled = isMultiTask ? agent.content : "";
    if (settings.selfReflection && !inputNeedsCognitivePipeline && agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const r = await reflect(input, text, (msgs) => this.generate(selectedModel, msgs));
        if (r.answer && r.answer.trim()) applyCorrection(r.answer.trim(), "reflect");
      } catch (_e) {
        // denetim hatası cevabı etkilemesin
      }
    }

    // Çok-turlu hafıza: kullanıcı + final cevabı sakla (araç gözlemleri hariç)
    if (inputNeedsCognitivePipeline && agent.stoppedReason !== "smalltalk") {
      try {
        const review = await runAdversarialReview(
          input,
          finalText,
          cognitivePreflight.report,
          (msgs) => this.generate(selectedModel, msgs, attemptModels)
        );
        if (review.answer && review.answer.trim()) applyCorrection(review.answer.trim(), "adversarial-review");
        if (!review.ok && review.errors && review.errors.length) {
          try { improveDrafts.recordSignal({ kind: "cognitive_review", subject: review.errors[0] }); } catch (_e) {}
        }
      } catch (_e) {
        // adversarial/self-critic hatasi cevabi bozmasin
      }
    }

    // RPRE (Ratio & Proportion Reasoning Engine): DETERMİNİSTİK pay modeli — EBSE'den ÖNCE.
    // Oran/orantı/"katı" sorularında toplamı doğrudan orana bölme hatasını yakalar; yanlışsa
    // pay modeliyle yeniden çözer. Model çağrısı YOK.
    // (multi_task: her görev zaten ayrı doğrulandı; tüm-metne uygulanırsa görevler arası
    //  sayıları karıştırıp cevabı bozabilir → atla.)
    if (agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        const rp = rpre.verify(input, finalText);
        if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) {
          if (applyCorrection(rp.correctedAnswer, "rpre")) {
            try { improveDrafts.recordSignal({ kind: "rpre_reject", subject: (rp.checks.find((c) => !c.ok) || {}).name || "ratio_parts" }); } catch (_e) {}
          }
        }
      } catch (_e) { /* RPRE hatası cevabı bozmasın */ }
    }

    // EBSE (Equation Back-Substitution Engine): DETERMİNİSTİK geri-yerine-koyma.
    // Self Critic -> [EBSE] -> MLVC -> AVE -> MCE. Model çağrısı YOK (hızlı, her zaman açık).
    // Türetilen değerleri orijinal denklemlere koyar; geçmezse cevabı reddedip YENİDEN hesaplar.
    if (agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        const eb = ebse.verify(input, finalText);
        if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) {
          if (applyCorrection(eb.correctedAnswer, "ebse")) {
            try { improveDrafts.recordSignal({ kind: "ebse_reject", subject: (eb.checks.find((c) => !c.ok) || {}).name || "back_substitution" }); } catch (_e) {}
          }
        }
      } catch (_e) { /* EBSE hatası cevabı bozmasın */ }
    }

    let mlvcApproved = false;
    if (inputNeedsVerification && agent.stoppedReason !== "smalltalk" && agent.stoppedReason !== "multi_task") {
      try {
        if (inputNeedsMLVC) {
          // deep KAPALI: yalnız deterministik kontrol (model çağrısı yok) → hızlı, donmaz.
          // deep AÇIK: ek olarak LLM doğrulama turu.
          const mlvc = await verifyMathLogic(
            input,
            finalText,
            deepReasoning ? (msgs) => this.generate(selectedModel, msgs, attemptModels) : null,
            { passes: 1 }
          );
          if (mlvc.answer && mlvc.answer.trim()) applyCorrection(mlvc.answer.trim(), "mlvc");
          mlvcApproved = !!mlvc.approved;
          if (!mlvc.approved && mlvc.errors && mlvc.errors.length) {
            try { improveDrafts.recordSignal({ kind: "mlvc", subject: mlvc.errors[0] }); } catch (_e) {}
          }
        }
        if (deepReasoning && !mlvcApproved) {
          const v = await verifyAnswer(
            input,
            finalText,
            (msgs) => this.generate(selectedModel, msgs, attemptModels),
            { categories: reasoningCategories, passes: 1 }
          );
          if (v.answer && v.answer.trim()) applyCorrection(v.answer.trim(), "ave");
        }
      } catch (_e) {
        // reasoning dogrulama hatasi cevabi bozmasin
      }
    }

    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const repaired = repairBenchmarkAnswer(input, finalText);
        if (repaired.repaired && repaired.answer && repaired.answer.trim()) applyCorrection(repaired.answer.trim(), "benchmark-repair");
      } catch (_e) {
        // deterministic benchmark repair must not break chat
      }
    }

    // HRIL (Human Reasoning & Interpretation Layer): matematiksel olarak doğru sonucu
    // insanın hemen anlayacağı karşılığa çevirir (örn. 7/15 -> %46,67; 0.5 saat -> 30 dk).
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const interpreted = hril.interpret(input, finalText);
        if (interpreted.answer && interpreted.answer.trim()) applyCorrection(interpreted.answer.trim(), "hril");
      } catch (_e) {
        // yorum katmanı cevabı bozmasın
      }
    }

    // REE (Reasoning -> Explanation Engine): doğrulanmış/yorumlanmış sonucu kısa,
    // anlaşılır açıklama yapısına çevirir; sonucu değiştirmez.
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const explained = ree.explain(input, finalText);
        if (explained.answer && explained.answer.trim()) applyCorrection(explained.answer.trim(), "ree");
      } catch (_e) {
        // açıklama katmanı cevabı bozmasın
      }
    }

    // TDE completion gate: multi-part prompts must visibly complete every detected task.
    if (agent.stoppedReason !== "smalltalk" && taskDecomposition.applicable) {
      try {
        let coverage = tde.validateTaskCoverage(finalText, taskDecomposition);
        if (!coverage.ok) {
          try { improveDrafts.recordSignal({ kind: "tde_missing_tasks", subject: coverage.missing.map((t) => t.label).join(", ") }); } catch (_e) {}
          const repaired = await this.generate(
            selectedModel,
            tde.buildCoverageRepairMessages(input, finalText, taskDecomposition, coverage),
            attemptModels
          );
          if (repaired && String(repaired).trim()) {
            applyCorrection(String(repaired).trim(), "tde-coverage-repair");
            const interpreted = hril.interpret(input, finalText);
            if (interpreted.answer && interpreted.answer.trim()) applyCorrection(interpreted.answer.trim(), "hril-after-tde");
            const explained = ree.explain(input, finalText);
            if (explained.answer && explained.answer.trim()) applyCorrection(explained.answer.trim(), "ree-after-tde");
          }
          coverage = tde.validateTaskCoverage(finalText, taskDecomposition);
          if (!coverage.ok) {
            finalText = `${finalText}\n\nGörev Tamamlama Uyarısı: ${taskDecomposition.count} görevden ${coverage.completed.length} tanesi görünür biçimde tamamlandı; eksik kalanlar: ${coverage.missing.map((t) => t.label).join(", ")}.`;
          }
        }
      } catch (_e) {
        // TDE must not crash chat.
      }
    }

    // Final Answer hard gate:
    // 1) soru metni Final Answer içine giremez
    // 2) her tespit edilen görev Final Answer içinde tam bir kez cevaplanmalı
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        let finalCheck = finalAnswerSanitizer.validateFinalAnswer(finalText, input, taskDecomposition);
        if (!finalCheck.ok) {
          try { improveDrafts.recordSignal({ kind: "final_answer_sanitizer", subject: finalCheck.errors[0] }); } catch (_e) {}
          const repaired = await this.generate(
            selectedModel,
            finalAnswerSanitizer.buildFinalAnswerRepairMessages(input, finalText, taskDecomposition, finalCheck),
            attemptModels
          );
          if (repaired && String(repaired).trim()) applyCorrection(String(repaired).trim(), "final-answer-sanitizer");
          finalCheck = finalAnswerSanitizer.validateFinalAnswer(finalText, input, taskDecomposition);
          if (!finalCheck.ok) {
            finalText = `${finalText}\n\nFinal Answer Kontrol Uyarısı: ${finalCheck.errors.join(" ")}`;
          }
        }
      } catch (_e) {
        // final sanitizer must not crash chat
      }
    }

    if (deepReasoning && inputNeedsConclusion && agent.stoppedReason !== "smalltalk") {
      try {
        const c = await enforceConclusion(
          input,
          finalText,
          (msgs) => this.generate(selectedModel, msgs, attemptModels)
        );
        if (c.answer && c.answer.trim()) applyCorrection(c.answer.trim(), "mce");
      } catch (_e) {
        // sonuc kapisi hatasi cevabi bozmasin
      }
    }

    // Cognitive Kernel final authority: every non-smalltalk answer exits through the
    // same staged orchestration pipeline. If a blocking gate still fails after repair,
    // the unsafe draft is not delivered to the user.
    if (agent.stoppedReason !== "smalltalk" && !isMultiTask) {
      try {
        const post = await cognitiveKernel.runPostValidation(cognitiveContextState, finalText, {
          stoppedReason: agent.stoppedReason,
          needsVerification: inputNeedsVerification,
          needsMLVC: inputNeedsMLVC,
          needsConclusion: inputNeedsConclusion,
          deepReasoning,
          reasoningCategories,
          generate: (msgs) => this.generate(selectedModel, msgs, attemptModels),
          onSignal: (signal) => {
            try { improveDrafts.recordSignal(signal); } catch (_e) {}
          },
        });
        if (post.answer && String(post.answer).trim()) finalText = String(post.answer).trim();
        if (!post.ok) {
          try { improveDrafts.recordSignal({ kind: "cognitive_kernel_block", subject: cognitiveContextState.blockReason }); } catch (_e) {}
        }
      } catch (_e) {
        // Kernel failures must not crash the app; previous deterministic gates have already run.
      }
    }

    // multi_task güvencesi: herhangi bir geç aşama etiketleri sildiyse, görev→cevap
    // eşlemeli birleştirmeyi geri yükle (asla anonim "değer | değer" gönderme).
    if (isMultiTask && multiTaskAssembled && multiTaskAssembled.trim()) {
      finalText = multiTaskAssembled.trim();
    }

    this.history.push({ role: "user", content: input });
    this.history.push({ role: "assistant", content: finalText });
    if (this.history.length > MAX_HISTORY_MESSAGES) {
      this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
    }

    // Gerçek kullanım istatistiği (demo değil): istek/token/süre/model/ajan
    try {
      const stats = require("./agent/stats");
      stats.record({
        model: selectedModel,
        agent: task,
        tokens: Math.round((String(input).length + String(finalText).length) / 4),
        ms: Date.now() - _t0,
      });
    } catch (_e) { /* istatistik hatası akışı bozmasın */ }

    // Otonom öğrenme: kullanıcı mesajından kalıcı kişisel gerçekleri öğren
    if (settings.autonomousLearning) {
      try {
        for (const fact of extractDurableFacts(input)) remember(fact);
      } catch (_e) {
        // öğrenme hatası sohbeti etkilemesin
      }
    }

    // Sürekli öğrenme açıksa: konuşmadan KONU TOHUMU çıkar (ajan kendi konularını bulsun).
    // Çok kısa/komut benzeri girdileri ele; ilk anlamlı ifadeyi konu yap.
    if (settings.continuousLearning) {
      try {
        const seed = String(input || "")
          .replace(/```[\s\S]*?```/g, " ") // kod bloklarını at
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
        if (seed.split(" ").length >= 2 && !isSmallTalk(input)) learningStore.addTopic(seed);
      } catch (_e) {}
    }

    this.state = {
      provider: "ollama",
      status: READY_STATES.READY,
      model: selectedModel,
      task,
      message: "Hazır",
    };

    return {
      provider: "ollama",
      model: selectedModel,
      text: finalText,
      iterations: agent.iterations,
      tools: agent.toolCalls.map((t) => t.name),
    };
  }

  /**
   * Tek bir üretim: önce Ollama HTTP /api/chat (messages + system + araç döngüsü
   * için gerekli), erişilemezse CLI `run`'a fallback (messages düzleştirilir).
   * runReact bunu generateFn olarak çağırır.
   */
  async generate(model, messages, fallbackModels = [], onToken = null) {
    const sig = this._abort ? this._abort.signal : undefined;
    // Bulut sağlayıcı (OpenAI-uyumlu) seçiliyse oraya yönlen — yerel Ollama gerekmez.
    const s = getSettings();
    if (s.provider === "openai" && String(s.openaiApiKey || "").trim()) {
      try {
        const o = {
          baseUrl: s.openaiBaseUrl,
          apiKey: s.openaiApiKey,
          model: s.openaiModel || "gpt-4o-mini",
          signal: sig,
        };
        const content = onToken
          ? await openaiChatStream(messages, { ...o, onToken })
          : await openaiChat(messages, o);
        if (content && content.trim()) return content;
      } catch (_e) {
        return ""; // bulut hatası -> üst katman boş-yanıt mesajı verir
      }
      return "";
    }
    if (await ollamaReachable()) {
      try {
        const content = onToken
          ? await ollamaChatStream(model, messages, { timeoutMs: OLLAMA_CHAT_TIMEOUT_MS, onToken, signal: sig })
          : await ollamaChat(model, messages, { timeoutMs: OLLAMA_CHAT_TIMEOUT_MS, signal: sig });
        if (content && content.trim()) return content;
      } catch (_e) {
        // HTTP başarısız -> CLI fallback (akışsız)
      }
    }
    const prompt = flattenMessages(messages);
    const models = [model, ...fallbackModels.filter((m) => m !== model)].slice(0, 3);
    for (const m of models) {
      const result = await this.runOllama(["run", m, prompt], {
        timeoutMs: OLLAMA_CHAT_TIMEOUT_MS,
      });
      if (result.ok && String(result.stdout || "").trim()) {
        return result.stdout.trim();
      }
    }
    return "";
  }
}

module.exports = {
  ModelManager,
  READY_STATES,
  instantAnswer,
  detectTask,
  wantsWebResearch,
  extractResearchQuery,
  candidateModelsForTask,
  chooseModelForTask,
  TASK_MODELS,
  missingModelReply,
  parsePullProgress,
  isSmallTalk,
};
