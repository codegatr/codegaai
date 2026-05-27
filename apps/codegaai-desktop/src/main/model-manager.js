const { spawn } = require("node:child_process");
const { DEFAULT_MODEL, OLLAMA_DOWNLOAD_URL } = require("../shared/constants");

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
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      resolve({ ok: false, stdout, stderr, error: error.message });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

class ModelManager {
  constructor() {
    this.state = {
      provider: "instant",
      status: READY_STATES.CHECKING,
      model: DEFAULT_MODEL,
      message: "Model durumu kontrol ediliyor",
    };
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

    const version = await runCommand("ollama", ["--version"]);
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

    const models = await runCommand("ollama", ["list"]);
    const hasDefault = models.ok && models.stdout.toLowerCase().includes(DEFAULT_MODEL.toLowerCase());
    this.state = {
      provider: "ollama",
      status: hasDefault ? READY_STATES.READY : READY_STATES.MISSING,
      model: DEFAULT_MODEL,
      message: hasDefault
        ? `${DEFAULT_MODEL} hazır`
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

    const result = await runCommand("ollama", ["pull", DEFAULT_MODEL]);
    if (!result.ok) {
      this.state = {
        ...this.state,
        status: READY_STATES.ERROR,
        message: result.stderr || result.error || "Model indirilemedi",
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

    const result = await runCommand("ollama", ["run", this.state.model, prompt]);
    if (!result.ok) {
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
