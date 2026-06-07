"use strict";

const {
  ollamaListModelDetails,
  ollamaCheckModelUpdate,
} = require("./ollama-client");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class ModelUpdateService {
  constructor(options = {}) {
    this.listModels = options.listModels || ollamaListModelDetails;
    this.checkModel = options.checkModel || ollamaCheckModelUpdate;
    this.updateModel = options.updateModel;
    this.logs = options.logs || null;
    this.now = options.now || (() => Date.now());
    this.state = {
      checking: false,
      applying: false,
      lastCheck: null,
      models: [],
      error: null,
    };
  }

  snapshot() {
    return clone(this.state);
  }

  async check() {
    if (this.state.checking) return this.snapshot();
    this.state.checking = true;
    this.state.error = null;
    try {
      const installed = await this.listModels();
      if (!Array.isArray(installed)) {
        throw new Error("Ollama model servisine ulaşılamadı.");
      }
      const results = [];
      for (const model of installed) {
        const checked = await this.checkModel(model);
        results.push({
          ...checked,
          size: Number(model.size) || null,
          modifiedAt: model.modified_at || null,
        });
      }
      this.state.models = results;
      this.state.lastCheck = this.now();
      this.logs?.info?.("models", `Model güncelleme kontrolü: ${results.filter((m) => m.updateAvailable).length} güncelleme`);
    } catch (error) {
      this.state.error = error && error.message ? error.message : String(error);
      this.logs?.warn?.("models", `Model güncelleme kontrolü başarısız: ${this.state.error}`);
    } finally {
      this.state.checking = false;
    }
    return this.snapshot();
  }

  async apply(name, onProgress) {
    if (typeof this.updateModel !== "function") {
      throw new Error("Model güncelleme uygulayıcısı tanımlı değil.");
    }
    if (this.state.applying) throw new Error("Başka bir model güncellemesi sürüyor.");
    const model = this.state.models.find((item) => item.name === name);
    if (!model || !model.updateAvailable) {
      throw new Error("Bu model için uygulanabilir güncelleme bulunamadı.");
    }
    this.state.applying = true;
    try {
      const result = await this.updateModel(name, onProgress);
      if (result && result.status === "error") {
        throw new Error(result.message || "Model güncellenemedi.");
      }
      this.logs?.info?.("models", `Model güncellendi: ${name}`);
      await this.check();
      return { ok: true, name, status: result, updates: this.snapshot() };
    } finally {
      this.state.applying = false;
    }
  }

  async applyAll(onProgress) {
    const names = this.state.models.filter((item) => item.updateAvailable).map((item) => item.name);
    const results = [];
    for (const name of names) {
      results.push(await this.apply(name, onProgress));
    }
    return { ok: true, updated: results.map((item) => item.name), status: this.snapshot() };
  }
}

module.exports = { ModelUpdateService };
