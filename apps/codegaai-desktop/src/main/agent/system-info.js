"use strict";
/**
 * agent/system-info.js
 * ---------------------
 * Donanım analizi + çalıştırılabilir/güncel model önerisi.
 * GPU/VRAM Node'dan güvenilir okunamadığı için öneri RAM tabanlıdır (muhafazakâr);
 * güçlü GPU'su olan kullanıcı daha büyük modeli elle seçebilir.
 *
 * recommendModel saf → test edilebilir.
 */

const os = require("os");

function recommendModel(ramGB, options = []) {
  const find = (id) => options.find((o) => o.id === id);
  let id;
  if (ramGB < 6) id = "qwen3:1.7b";
  else if (ramGB < 10) id = "qwen3:4b";
  else if (ramGB < 18) id = "qwen3:8b";
  else if (ramGB >= 32) id = "qwen3:14b";
  else id = "qwen3:8b";
  const opt = find(id) || find("qwen3:4b") || find("qwen2.5:3b") || options[0] || { id, label: id };
  return {
    id: opt.id,
    label: opt.label || opt.id,
    reason: `${ramGB} GB RAM için uygun (güncel yerel model)`,
  };
}

function analyze(options = []) {
  const cpus = os.cpus() || [];
  const ramGB = Math.max(1, Math.round(os.totalmem() / 1024 ** 3));
  return {
    ramGB,
    freeGB: Math.round(os.freemem() / 1024 ** 3),
    cores: cpus.length,
    cpu: ((cpus[0] && cpus[0].model) || "bilinmiyor").trim(),
    platform: process.platform,
    arch: process.arch,
    recommended: recommendModel(ramGB, options),
  };
}

/**
 * Cookbook fit skoru (SAF). hw: { vramGb (null=GPU yok), ramGb }, model: katalog girdisi.
 * fit: "gpu" (VRAM'e rahat sığar → hızlı) | "gpu-tight" (sığar ama sıkışık) |
 *      "cpu" (VRAM yetmez ama RAM yeter → yavaş) | "no" (RAM de yetmez).
 */
function scoreModelFit(model, hw) {
  const vram = hw && Number.isFinite(hw.vramGb) ? hw.vramGb : null;
  const ram = hw && Number.isFinite(hw.ramGb) ? hw.ramGb : 0;
  const minV = Number(model.minVramGb) || 99;
  const minR = Number(model.minRamGb) || 99;
  const quality = Number(model.quality) || 1;
  let fit = "no";
  if (vram != null && vram >= minV) fit = "gpu";
  else if (vram != null && vram >= minV * 0.85) fit = "gpu-tight";
  else if (ram >= minR) fit = "cpu";
  else fit = "no";
  // skor: kalite ana sürücü; uyum çarpanı hız/uygulanabilirliği yansıtır
  const fitMul = { gpu: 1, "gpu-tight": 0.8, cpu: 0.45, no: 0 }[fit];
  const score = Math.round(quality * 20 * fitMul);
  const labelTr = { gpu: "GPU — hızlı", "gpu-tight": "GPU — sıkışık", cpu: "CPU — yavaş", no: "Yetersiz donanım" }[fit];
  return { fit, score, fitLabel: labelTr, runnable: fit !== "no" };
}

/**
 * Donanıma göre model listesini skorla + en iyisini öner (SAF).
 * Öneri: GPU'ya (gpu>gpu-tight) sığan en yüksek kaliteli; GPU yoksa CPU'da çalışan en yüksek kaliteli.
 */
function recommendCookbook(hw, catalog) {
  const items = (catalog || []).map((m) => ({ ...m, ...scoreModelFit(m, hw) }));
  const byBest = (a, b) => (b.score - a.score) || ((Number(b.quality) || 0) - (Number(a.quality) || 0)) || ((Number(a.sizeGb) || 0) - (Number(b.sizeGb) || 0));
  // Başlık önerisi GENEL model olmalı (kod modellerini Router görev bazlı seçer).
  const isGeneral = (m) => m.task !== "code";
  const pick = (pool) => {
    const gpu = pool.filter((m) => m.fit === "gpu" || m.fit === "gpu-tight").sort(byBest);
    const any = pool.filter((m) => m.runnable).sort(byBest);
    return gpu[0] || any[0] || null;
  };
  const best = pick(items.filter(isGeneral)) || pick(items);
  let reason = "Donanımına uygun model bulunamadı.";
  if (best) {
    if (best.fit === "gpu") reason = `${best.params || ""} model GPU'na (${hw.vramGb} GB VRAM) rahat sığar — hızlı çalışır.`;
    else if (best.fit === "gpu-tight") reason = `${best.params || ""} model GPU'na sığar ama sıkışık; yine de en güçlü seçenek.`;
    else reason = `GPU yetersiz; ${best.params || ""} model CPU + ${hw.ramGb} GB RAM ile çalışır (yavaş ama en güçlü uygulanabilir).`;
  }
  return { items: items.sort(byBest), recommended: best ? { id: best.id, label: best.label || best.id, fit: best.fit, reason } : null };
}

/**
 * Gerçek donanımı oku (VRAM nvidia-smi, RAM/CPU os) ve cookbook üret. ASYNC.
 * catalog: [{ id, label, description, task, ...katalog metadata }]
 */
async function analyzeCookbook(catalog = []) {
  const os = require("os");
  const ramGb = Math.max(1, Math.round(os.totalmem() / 1024 ** 3));
  let vramGb = null;
  let gpuName = null;
  try {
    const metrics = require("./metrics");
    const g = await metrics.gpuVram();
    if (g && g.totalMB) vramGb = Math.round((g.totalMB / 1024) * 10) / 10;
  } catch (_e) { /* GPU yok/okunamadı */ }
  const hw = { ramGb, vramGb, cores: (os.cpus() || []).length, hasGpu: vramGb != null, gpuName };
  const reco = recommendCookbook(hw, catalog);
  return { hardware: hw, models: reco.items, recommended: reco.recommended };
}

module.exports = { analyze, recommendModel, scoreModelFit, recommendCookbook, analyzeCookbook };
