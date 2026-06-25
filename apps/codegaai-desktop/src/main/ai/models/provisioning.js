"use strict";

const CORE_CHAT_MODEL = "qwen3.5:0.8b";
const CORE_CODE_MODEL = "qwen2.5-coder:3b";

function normalize(model) {
  return String(model || "").toLowerCase().replace(/:latest$/, "").trim();
}

function hasModel(installed = [], model = "") {
  const wanted = normalize(model);
  return (installed || []).some((item) => normalize(item) === wanted);
}

function missingCoreModels(installed = [], opts = {}) {
  const required = [CORE_CHAT_MODEL];
  if (opts.includeCode === true) required.push(CORE_CODE_MODEL);
  return required.filter((model) => !hasModel(installed, model));
}

function shouldAutoPrepare(installed = [], route = {}) {
  const missingChat = !hasModel(installed, CORE_CHAT_MODEL);
  if (!missingChat) return { needed: false, model: "", reason: "core_chat_ready" };
  const intent = route && route.intent ? route.intent : "balanced";
  if (["chat", "short_fact", "balanced", "code", "analysis"].includes(intent)) {
    return { needed: true, model: CORE_CHAT_MODEL, reason: `missing_core_chat_for_${intent}` };
  }
  return { needed: true, model: CORE_CHAT_MODEL, reason: "missing_core_chat" };
}

function userMessage(model = CORE_CHAT_MODEL) {
  return `Temel hızlı model (${model}) bu bilgisayarda yüklü değil. CODEGA AI ağır modele takılmamak için bu modeli hazırlamalı.`;
}

module.exports = {
  CORE_CHAT_MODEL,
  CORE_CODE_MODEL,
  hasModel,
  missingCoreModels,
  shouldAutoPrepare,
  userMessage,
};
