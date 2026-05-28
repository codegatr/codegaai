const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_MODEL,
  FALLBACK_MODELS,
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
    return "Ben CODEGA AI. Windows üzerinde çalışan, kod, araştırma, proje planlama ve günlük üretim işlerini tek sade sohbet ekranında yöneten kişisel yapay zeka asistanınım.";
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

function hasModel(listOutput, model) {
  const wanted = model.toLowerCase();
  return listOutput
    .toLowerCase()
    .split(/\r?\n/)
    .some((line) => line.split(/\s+/)[0] === wanted);
}

class ModelManager {
  constructor() {
    this.ollamaCommand = null;
    this.state = {
      provider: "instant",
      status: READY_STATES.CHECKING,
      model: DEFAULT_MODEL,
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
        message: "Ollama bulunamadı. CODEGA AI temel modda hazır; yerel model için Ollama kurulmalı.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
      return this.getStatus();
    }

    const models = await this.runOllama(["list"]);
    const installedModel = models.ok
      ? modelCandidates().find((model) => hasModel(models.stdout, model))
      : null;
    this.state = {
      provider: "ollama",
      status: installedModel ? READY_STATES.READY : READY_STATES.MISSING,
      model: installedModel || DEFAULT_MODEL,
      message: installedModel
        ? `${installedModel} hazır`
        : `${DEFAULT_MODEL} indirilmeli. Ayarlardan modeli hazırlayabilirsin.`,
    };
    return this.getStatus();
  }

  async prepareDefaultModel(onProgress) {
    await this.detect();
    if (this.state.provider !== "ollama") {
      return {
        ...this.getStatus(),
        message: "Ollama kurulu değil. Modeli hazırlamak için önce Ollama kurulumu açılıyor.",
        action: "install_ollama",
        actionUrl: OLLAMA_DOWNLOAD_URL,
      };
    }
    if (this.state.status === READY_STATES.READY) {
      return this.getStatus();
    }

    this.state = {
      ...this.state,
      status: READY_STATES.CHECKING,
      message: `${DEFAULT_MODEL} indiriliyor`,
    };
    onProgress?.(this.getStatus());

    const result = await this.runOllama(["pull", DEFAULT_MODEL], {
      timeoutMs: OLLAMA_PULL_TIMEOUT_MS,
      onData: (chunk) => {
        const progress = chunk.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
        if (!progress) return;
        this.state = {
          ...this.state,
          message: `${DEFAULT_MODEL} indiriliyor: ${progress.slice(0, 90)}`,
        };
        onProgress?.(this.getStatus());
      },
    });
    if (!result.ok) {
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: result.stderr || result.error || `${DEFAULT_MODEL} indirilemedi`,
      };
      return this.getStatus();
    }

    this.state = {
      provider: "ollama",
      status: READY_STATES.READY,
      model: DEFAULT_MODEL,
      message: `${DEFAULT_MODEL} hazır`,
    };
    return this.getStatus();
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

    if (this.state.provider !== "ollama" || this.state.status !== READY_STATES.READY) {
      return {
        provider: "instant",
        model: "codega-setup",
        text: "Yerel model henüz hazır değil. Ayarlardan modeli hazırlayabilirsin; bu sırada basit komutlarda temel modla yardımcı olurum.",
      };
    }

    const prompt = [
      "Sen CODEGA AI'sın. Türkçe, net, samimi ve kısa cevap ver.",
      `Kullanıcı: ${input}`,
      "CODEGA AI:",
    ].join("\n");

    const result = await this.runOllama(["run", this.state.model, prompt], {
      timeoutMs: OLLAMA_CHAT_TIMEOUT_MS,
    });
    if (!result.ok) {
      if (result.timedOut) {
        this.state = {
          ...this.state,
          status: READY_STATES.READY,
          message: `${this.state.model} cevap zaman aşımına uğradı`,
        };
        return {
          provider: "instant",
          model: "codega-timeout",
          text: "Model bu soruya zamanında cevap veremedi. Uygulama takılmadı; istersen daha kısa bir istekle tekrar dene veya Ayarlar'dan daha hızlı/küçük bir model seç.",
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
        text: "Model şu an yanıt veremedi. Durumu kontrol ettim; uygulama çalışıyor, sorun model sağlayıcı tarafında.",
      };
    }

    return {
      provider: "ollama",
      model: this.state.model,
      text: result.stdout.trim() || "Yanıt boş döndü.",
    };
  }
}

module.exports = {
  ModelManager,
  READY_STATES,
  instantAnswer,
};
