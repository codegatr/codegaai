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
  if (ramGB < 6) id = "qwen2.5:1.5b";
  else if (ramGB < 10) id = "qwen2.5:3b";
  else if (ramGB < 18) id = "qwen3:8b";
  else id = "qwen3:8b";
  const opt = find(id) || find("qwen2.5:3b") || options[0] || { id, label: id };
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

module.exports = { analyze, recommendModel };
