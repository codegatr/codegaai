"use strict";

function gb(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function recommendForHardware(hardware = {}, installedModels = []) {
  const ramGb = gb(hardware.ramGb);
  const vramGb = gb(hardware.vramGb);
  const installed = new Set(installedModels || []);

  const chat = vramGb >= 5 || ramGb >= 12 ? "qwen3.5:4b" : "qwen3.5:2b";
  const planning = vramGb >= 8 || ramGb >= 18 ? "qwen3.5:9b" : "qwen3.5:4b";
  const code = installed.has("qwen2.5-coder:3b") ? "qwen2.5-coder:3b" : "qwen2.5-coder:3b";

  return {
    shortFact: "qwen3.5:0.8b",
    chat,
    code,
    planning,
    vision: "gemma3:4b",
  };
}

function compareRecommendation(state = {}) {
  const recommended = state.recommended || {};
  const mismatches = [];
  const pairs = [
    ["shortFact", state.shortFactModel, recommended.shortFact],
    ["chat", state.chatModel, recommended.chat],
    ["code", state.codeModel, recommended.code],
    ["planning", state.planningModel, recommended.planning],
    ["vision", state.visionModel, recommended.vision],
  ];
  for (const [role, active, target] of pairs) {
    if (active && target && active !== target) mismatches.push({ role, active, recommended: target });
  }
  return {
    optimal: mismatches.length === 0,
    mismatches,
  };
}

module.exports = {
  recommendForHardware,
  compareRecommendation,
};
