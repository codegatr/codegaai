"use strict";

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function recommendForHardware(hardware = {}, installedModels = []) {
  const ramGb = numeric(hardware.ramGb);
  const vramGb = numeric(hardware.vramGb);
  const installed = new Set(installedModels || []);
  return {
    shortFact: "qwen3.5:0.8b",
    chat: vramGb >= 5 || ramGb >= 12 ? "qwen3.5:4b" : "qwen3.5:2b",
    code: installed.has("qwen2.5-coder:3b") ? "qwen2.5-coder:3b" : "qwen2.5-coder:3b",
    planning: vramGb >= 8 || ramGb >= 18 ? "qwen3.5:9b" : "qwen3.5:4b",
    vision: "gemma3:4b",
  };
}

function compareRecommendation(state = {}) {
  const recommended = state.recommended || {};
  const checks = [
    ["shortFact", state.shortFactModel, recommended.shortFact],
    ["chat", state.chatModel, recommended.chat],
    ["code", state.codeModel, recommended.code],
    ["planning", state.planningModel, recommended.planning],
    ["vision", state.visionModel, recommended.vision],
  ];
  const mismatches = checks
    .filter(([, active, target]) => active && target && active !== target)
    .map(([role, active, recommended]) => ({ role, active, recommended }));
  return {
    optimal: mismatches.length === 0,
    mismatches,
  };
}

module.exports = {
  recommendForHardware,
  compareRecommendation,
};
