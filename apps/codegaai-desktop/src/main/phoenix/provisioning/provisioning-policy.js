"use strict";

const CORE_MODELS = {
  chat: "qwen3.5:0.8b",
  short_fact: "qwen3.5:0.8b",
  code: "qwen2.5-coder:3b",
  analysis: "qwen3.5:4b",
  research: "qwen3.5:4b",
  design: "qwen3.5:4b",
};

const FALLBACKS = {
  chat: ["qwen3.5:2b", "qwen2.5:1.5b"],
  short_fact: ["qwen3.5:2b", "qwen2.5:1.5b"],
  code: ["qwen2.5-coder:7b", "qwen2.5-coder:3b-instruct"],
  analysis: ["qwen3.5:9b", "qwen3:8b"],
  research: ["qwen3.5:9b"],
  design: ["gemma3:4b"],
};

function normalize(model) {
  return String(model || "").toLowerCase().replace(/:latest$/, "").trim();
}

function hasInstalled(installed = [], model = "") {
  const wanted = normalize(model);
  return (installed || []).some((item) => normalize(item) === wanted);
}

function requiredModelForIntent(intent = "chat") {
  const type = typeof intent === "string" ? intent : intent.type;
  return CORE_MODELS[type] || CORE_MODELS.chat;
}

function chainForIntent(intent = "chat") {
  const type = typeof intent === "string" ? intent : intent.type;
  const primary = requiredModelForIntent(type);
  return [primary, ...(FALLBACKS[type] || [])].filter(Boolean);
}

function chooseInstalledModel(intent = "chat", installed = []) {
  for (const model of chainForIntent(intent)) {
    if (hasInstalled(installed, model)) return model;
  }
  return "";
}

function provisioningDecision(intent = "chat", installed = []) {
  const type = typeof intent === "string" ? intent : intent.type;
  const installedModel = chooseInstalledModel(type, installed);
  if (installedModel) {
    return { needed: false, ready: true, intent: type, model: installedModel, reason: "installed_model_available" };
  }
  const required = requiredModelForIntent(type);
  return { needed: true, ready: false, intent: type, model: required, reason: `missing_required_${type}_model` };
}

module.exports = {
  CORE_MODELS,
  FALLBACKS,
  normalize,
  hasInstalled,
  requiredModelForIntent,
  chainForIntent,
  chooseInstalledModel,
  provisioningDecision,
};
