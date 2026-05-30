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
const { ollamaChat, ollamaReachable, ollamaListModels } = require("./agent/ollama-client");
const { runReact } = require("./agent/agent-loop");
const { buildSystemPrompt } = require("./agent/system-prompt");
const { getSettings } = require("./agent/settings-store");
const { recall, remember, extractDurableFacts } = require("./agent/memory");
const rag = require("./agent/rag");
const { reflect } = require("./agent/reflect");
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
    this._queue = Promise.resolve(); // ask() serileştirme kuyruğu
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
    };
    onProgress?.(this.getStatus());

    const result = await this.runOllama(["pull", target.id], {
      timeoutMs: OLLAMA_PULL_TIMEOUT_MS,
      onData: (chunk) => {
        const progress = chunk.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
        if (!progress) return;
        this.state = {
          ...this.state,
          message: `${target.label} indiriliyor: ${progress.slice(0, 90)}`,
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
    };
    return this.getStatus();
  }

  async prepareDefaultModel(onProgress) {
    return this.prepareModel(DEFAULT_MODEL, onProgress);
  }

  // Aynı anda gelen mesajları SIRAYA al: yerel model tek seferde tek üretim
  // yapsın (eşzamanlı istekler küçük modeli tıkar ve "Düşünüyorum"da bırakır).
  ask(input) {
    const run = () => this._ask(input);
    const result = this._queue.then(run, run);
    this._queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async _ask(input) {
    const instant = instantAnswer(input);
    if (instant) {
      return {
        provider: "instant",
        model: "codega-instant",
        text: instant,
      };
    }

    if (this.state.provider !== "ollama") {
      await this.detect();
    }
    if (this.state.provider !== "ollama") {
      return {
        provider: "instant",
        model: "codega-setup",
        text: "Yerel zeka motoru hazır değil. Ayarlardan kurulumu başlatıp önerilen zeka paketlerini indirebilirsin.",
      };
    }

    const installed = await this.installedModels();
    const task = detectTask(input);
    const attemptModels = candidateModelsForTask(task, installed);
    const selectedModel = attemptModels[0] || chooseModelForTask(task, installed);
    if (!attemptModels.length) {
      this.state = {
        provider: "ollama",
        status: READY_STATES.MISSING,
        model: selectedModel,
        task,
        message: "Gerekli zeka paketi hazır değil.",
      };
      return {
        provider: "instant",
        model: "codega-model-router",
        text: "Bu iş için gerekli zeka paketi henüz hazır değil. Ayarlar > Model Paketleri bölümünden ilgili paketi indirebilirsin; sonra ben arka planda kendim kullanırım.",
      };
    }

    this.state = {
      provider: "ollama",
      status: READY_STATES.READY,
      model: selectedModel,
      task,
      message: "Düşünüyorum...",
    };

    // Otonom öğrenme: kullanıcı hakkında hatırladıklarını system prompt'a kat
    const settings = getSettings();
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

    // Hedef-odaklı planlama (opt-in): karmaşık hedefi alt adımlara böl
    let plan = [];
    if (settings.planner && looksLikeGoal(input)) {
      try {
        plan = await makePlan(input, (msgs) => this.generate(selectedModel, msgs));
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
        }),
      },
      ...this.history,
      { role: "user", content: input },
    ];

    const generateFn = (msgs) => this.generate(selectedModel, msgs, attemptModels);

    let agent;
    try {
      if (isSmallTalk(input)) {
        // Basit selam/sohbet: araçsız, kısa, doğrudan cevap (ajan saçmalamasın)
        const sttMsgs = [
          { role: "system", content: smallTalkPrompt(settings.humanTone) },
          ...this.history.slice(-4),
          { role: "user", content: input },
        ];
        const direct = await this.generate(selectedModel, sttMsgs, attemptModels);
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
        agent = await runReact(messages, generateFn, { maxIters: 3 });
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
    if (settings.selfReflection && agent.stoppedReason !== "smalltalk") {
      try {
        const r = await reflect(input, text, (msgs) => this.generate(selectedModel, msgs));
        if (r.answer && r.answer.trim()) finalText = r.answer.trim();
      } catch (_e) {
        // denetim hatası cevabı etkilemesin
      }
    }

    // Çok-turlu hafıza: kullanıcı + final cevabı sakla (araç gözlemleri hariç)
    this.history.push({ role: "user", content: input });
    this.history.push({ role: "assistant", content: finalText });
    if (this.history.length > MAX_HISTORY_MESSAGES) {
      this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
    }

    // Otonom öğrenme: kullanıcı mesajından kalıcı kişisel gerçekleri öğren
    if (settings.autonomousLearning) {
      try {
        for (const fact of extractDurableFacts(input)) remember(fact);
      } catch (_e) {
        // öğrenme hatası sohbeti etkilemesin
      }
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
  async generate(model, messages, fallbackModels = []) {
    if (await ollamaReachable()) {
      try {
        const content = await ollamaChat(model, messages, {
          timeoutMs: OLLAMA_CHAT_TIMEOUT_MS,
        });
        if (content && content.trim()) return content;
      } catch (_e) {
        // HTTP başarısız -> CLI fallback
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
  candidateModelsForTask,
  isSmallTalk,
};
