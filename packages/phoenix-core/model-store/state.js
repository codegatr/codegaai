"use strict";

const DEFAULT_STATE = Object.freeze({
  chatModel: "qwen3.5:4b",
  shortFactModel: "qwen3.5:0.8b",
  codeModel: "qwen2.5-coder:3b",
  planningModel: "qwen3.5:9b",
  visionModel: "gemma3:4b",
  activeRuntimeModel: "",
  installedModels: [],
  recommended: {
    chat: "qwen3.5:4b",
    shortFact: "qwen3.5:0.8b",
    code: "qwen2.5-coder:3b",
    planning: "qwen3.5:9b",
    vision: "gemma3:4b",
  },
  hardware: {
    cpu: "unknown",
    ramGb: 0,
    gpu: "unknown",
    vramGb: 0,
  },
  updatedAt: null,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeModelId(value) {
  return String(value || "").trim();
}

function normalizeModelList(models = []) {
  return [...new Set((models || []).map(normalizeModelId).filter(Boolean))];
}

function createInitialState(partial = {}) {
  return {
    ...clone(DEFAULT_STATE),
    ...partial,
    installedModels: normalizeModelList(partial.installedModels || DEFAULT_STATE.installedModels),
    recommended: {
      ...clone(DEFAULT_STATE.recommended),
      ...(partial.recommended || {}),
    },
    hardware: {
      ...clone(DEFAULT_STATE.hardware),
      ...(partial.hardware || {}),
    },
    updatedAt: partial.updatedAt || new Date().toISOString(),
  };
}

function withPatch(state, patch = {}) {
  const next = createInitialState({
    ...state,
    ...patch,
    recommended: {
      ...(state.recommended || {}),
      ...(patch.recommended || {}),
    },
    hardware: {
      ...(state.hardware || {}),
      ...(patch.hardware || {}),
    },
  });
  next.updatedAt = new Date().toISOString();
  return next;
}

module.exports = {
  DEFAULT_STATE,
  createInitialState,
  normalizeModelId,
  normalizeModelList,
  withPatch,
};
