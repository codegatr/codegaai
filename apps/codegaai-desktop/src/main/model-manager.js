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

const READY_STATES = {
  CHECKING: "checking",
  READY: "ready",
  MISSING: "missing",
  ERROR: "error",
};

const TASK_MODELS = {
  code: ["qwen2.5-coder:7b-instruct", "qwen2.5-coder:3b-instruct", "qwen3:8b", DEFAULT_MODEL],
  image: ["qwen3:8b", "qwen2.5:3b", "gemma3:4b", DEFAULT_MODEL],
  writing: ["qwen3:8b", "mistral:7b", "qwen2.5:3b", DEFAULT_MODEL],
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

class ModelManager {
  constructor() {
    this.ollamaCommand = null;
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
    const models = await this.runOllama(["list"]);
    return models.ok ? parseInstalledModels(models.stdout) : [];
  }

  async detect() {
    this.state = {
      ...this.state,
      status: READY_STATES.CHECKING,
      message: "Ollama aranıyor",
    };

    const version = await this.runOllama(["--version"]);
    if (!version.ok) {
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

  async ask(input) {
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
    const selectedModel = chooseModelForTask(task, installed);
    const selected = modelOption(selectedModel);
    if (!installed.includes(selectedModel)) {
      this.state = {
        provider: "ollama",
        status: READY_STATES.MISSING,
        model: selectedModel,
        task,
        message: `${selected.label} gerekli. Ayarlardan indirilebilir.`,
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

    const prompt = [
      "Sen CODEGA AI'sın. Türkçe, net, samimi ve uygulanabilir cevap ver.",
      `Görev türü: ${task}`,
      "İç model/paket adlarını kullanıcıya söyleme; sadece doğal şekilde yanıt ver.",
      `Kullanıcı: ${input}`,
      "CODEGA AI:",
    ].join("\n");

    const result = await this.runOllama(["run", selectedModel, prompt], {
      timeoutMs: OLLAMA_CHAT_TIMEOUT_MS,
    });
    if (!result.ok) {
      if (result.timedOut) {
        this.state = {
          ...this.state,
          status: READY_STATES.READY,
          message: "Yanıt zaman aşımına uğradı",
        };
        return {
          provider: "instant",
          model: "codega-timeout",
          text: "Bu istekte zamanında cevap veremedim. Uygulama takılmadı; Ayarlar'dan daha küçük/hızlı zeka paketini indirirsen benzer isteklerde arka planda daha hızlı çalışabilirim.",
        };
      }
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: result.stderr || result.error || "Model yanıt veremedi",
      };
      return {
        provider: "instant",
        model: "codega-error",
        text: "Model şu an yanıt veremedi. Uygulama çalışıyor; sorun yerel model tarafında.",
      };
    }

    return {
      provider: "ollama",
      model: selectedModel,
      text: result.stdout.trim() || "Yanıt boş döndü.",
    };
  }
}

module.exports = {
  ModelManager,
  READY_STATES,
  instantAnswer,
  detectTask,
};
