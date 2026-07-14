"use strict";

const { MODEL_CATALOG } = require("../../shared/constants");

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function profileDevice(hardware = {}) {
  const ramGb = Math.max(1, finite(hardware.ramGb ?? hardware.ramGB, 1));
  const vramValue = hardware.vramGb ?? hardware.vramGB;
  const vramGb = vramValue === null || vramValue === undefined ? null : Math.max(0, finite(vramValue));
  const cores = Math.max(1, Math.floor(finite(hardware.cores, 1)));
  const gpuBudgetGb = vramGb === null ? 0 : Math.max(0, vramGb - 1.5);
  const cpuBudgetGb = Math.max(0, ramGb * 0.58 - 2);
  const effectiveBudgetGb = Math.max(gpuBudgetGb, cpuBudgetGb);
  const tier = effectiveBudgetGb >= 14 && cores >= 8
    ? "performance"
    : effectiveBudgetGb >= 5 && cores >= 4
      ? "balanced"
      : "constrained";
  return {
    ramGb,
    vramGb,
    cores,
    hasGpu: vramGb !== null && vramGb > 0,
    gpuBudgetGb: Math.round(gpuBudgetGb * 10) / 10,
    cpuBudgetGb: Math.round(cpuBudgetGb * 10) / 10,
    effectiveBudgetGb: Math.round(effectiveBudgetGb * 10) / 10,
    tier,
  };
}

function fits(modelId, profile, catalog = MODEL_CATALOG) {
  const model = catalog[modelId] || {};
  const sizeGb = finite(model.sizeGb, Number.POSITIVE_INFINITY);
  const minRamGb = finite(model.minRamGb, Number.POSITIVE_INFINITY);
  const minVramGb = finite(model.minVramGb, Number.POSITIVE_INFINITY);
  const gpuFit = profile.hasGpu && profile.vramGb >= minVramGb && sizeGb <= profile.gpuBudgetGb;
  const cpuFit = profile.ramGb >= minRamGb && sizeGb <= profile.cpuBudgetGb;
  return gpuFit || cpuFit;
}

function firstFit(candidates, profile, catalog) {
  return candidates.find((model) => fits(model, profile, catalog)) || candidates[candidates.length - 1];
}

function recommendModelSet(hardware = {}, catalog = MODEL_CATALOG) {
  const profile = profileDevice(hardware);
  const recommended = {
    shortFact: firstFit(["qwen3.5:2b", "qwen3.5:0.8b"], profile, catalog),
    chat: firstFit(["qwen3.5:9b", "qwen3.5:4b", "qwen3.5:2b", "qwen3.5:0.8b"], profile, catalog),
    code: firstFit(["qwen2.5-coder:7b", "qwen2.5-coder:3b"], profile, catalog),
    analysis: firstFit(["qwen3.6:27b", "qwen3.5:9b", "qwen3.5:4b", "qwen3.5:2b"], profile, catalog),
    vision: firstFit(["gemma3:4b", "qwen3.5:2b"], profile, catalog),
  };
  return { profile, recommended };
}

function modelForTask(task, recommendation = {}) {
  if (task === "code") return recommendation.code;
  if (task === "analysis" || task === "research" || task === "planning") return recommendation.analysis;
  if (task === "image" || task === "vision") return recommendation.vision;
  if (task === "short_fact") return recommendation.shortFact;
  return recommendation.chat;
}

module.exports = {
  profileDevice,
  recommendModelSet,
  modelForTask,
  fits,
};
