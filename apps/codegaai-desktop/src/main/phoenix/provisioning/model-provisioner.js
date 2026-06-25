"use strict";

const { provisioningDecision } = require("./provisioning-policy");

function progressMessage(state) {
  if (!state) return "Phoenix model hazırlığı başlatılıyor.";
  if (state.status === "ollama_starting") return "Phoenix yerel AI motorunu başlatıyor.";
  if (state.status === "model_downloading") return `Phoenix gerekli modeli hazırlıyor: ${state.model}`;
  if (state.status === "model_ready") return `Model hazır: ${state.model}`;
  if (state.status === "ollama_missing") return "Ollama bu bilgisayarda bulunamadı. Kurulum gerekli.";
  return "Phoenix model hazırlığı sürüyor.";
}

async function ensureModelReadyForIntent({ intent, installedModels = [], adapters = {}, onProgress } = {}) {
  const decision = provisioningDecision(intent, installedModels);
  if (decision.ready) {
    return {
      ready: true,
      model: decision.model,
      intent: decision.intent,
      status: "model_ready",
      userMessage: "",
    };
  }

  if (typeof adapters.ensureOllamaReady === "function") {
    onProgress?.({ status: "ollama_starting", model: decision.model, message: progressMessage({ status: "ollama_starting", model: decision.model }) });
    const ollama = await adapters.ensureOllamaReady();
    if (!ollama || ollama.ok === false) {
      return {
        ready: false,
        model: decision.model,
        intent: decision.intent,
        status: ollama && ollama.reason === "missing" ? "ollama_missing" : "failed_recoverable",
        userMessage: "Phoenix yerel AI motorunu otomatik başlatamadı. Ollama kurulu değilse önce kurulum gerekli.",
      };
    }
  }

  if (typeof adapters.pullModel === "function") {
    onProgress?.({ status: "model_downloading", model: decision.model, message: progressMessage({ status: "model_downloading", model: decision.model }) });
    const pulled = await adapters.pullModel(decision.model, (progress) => {
      onProgress?.({ status: "model_downloading", model: decision.model, progress });
    });
    if (pulled && pulled.ok) {
      return {
        ready: true,
        model: decision.model,
        intent: decision.intent,
        status: "model_ready",
        userMessage: "",
      };
    }
  }

  return {
    ready: false,
    model: decision.model,
    intent: decision.intent,
    status: "request_queued",
    userMessage: `${decision.model} modeli hazırlanıyor. Hazır olunca isteğe otomatik devam edilecek.`,
  };
}

module.exports = {
  ensureModelReadyForIntent,
  progressMessage,
};
