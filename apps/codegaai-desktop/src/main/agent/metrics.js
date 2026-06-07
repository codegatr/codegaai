"use strict";
/**
 * agent/metrics.js
 * -----------------
 * GERÇEK sistem metrikleri. CPU/RAM kesin (os modülü). GPU VRAM nvidia-smi ile
 * (yoksa null). Disk best-effort (yoksa null). Demo değerlerin yerini alır.
 */

const os = require("os");
const { spawn } = require("child_process");

function _cpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    for (const k of Object.keys(c.times)) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

/** İki örnek arası CPU meşguliyet yüzdesi (0-100). */
function cpuPercent(sampleMs = 200) {
  return new Promise((resolve) => {
    const a = _cpuTimes();
    setTimeout(() => {
      const b = _cpuTimes();
      const idle = b.idle - a.idle;
      const total = b.total - a.total;
      if (total <= 0) return resolve(0);
      const pct = 100 - Math.round((idle / total) * 100);
      resolve(Math.max(0, Math.min(100, pct)));
    }, sampleMs);
  });
}

function ramPercent() {
  const total = os.totalmem();
  const free = os.freemem();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((total - free) / total) * 100)));
}

function _run(cmd, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try { child = spawn(cmd, args, { windowsHide: true }); }
    catch (_e) { return resolve(null); }
    const timer = setTimeout(() => { try { child.kill(); } catch (_e) {} resolve(null); }, timeoutMs);
    if (child.stdout) child.stdout.on("data", (d) => { out += d.toString(); });
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0 ? out : null); });
  });
}

/** NVIDIA GPU VRAM kullanımı (yüzde) + MB değerleri; yoksa null. */
async function gpuVram() {
  const out = await _run("nvidia-smi", ["--query-gpu=name,memory.used,memory.total", "--format=csv,noheader,nounits"]);
  if (!out) return null;
  const line = out.split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  const parts = line.split(",").map((x) => x.trim());
  const usedMB = parseInt(parts[1], 10);
  const totalMB = parseInt(parts[2], 10);
  if (parts.length < 3 || !totalMB) return null;
  return {
    name: parts[0] || null,
    usedMB,
    totalMB,
    percent: Math.max(0, Math.min(100, Math.round((usedMB / totalMB) * 100))),
  };
}

/** Tüm metrikleri topla. Eksikler null. */
async function snapshot() {
  const [cpu, gpu] = await Promise.all([cpuPercent(), gpuVram()]);
  return {
    cpu,
    ram: ramPercent(),
    gpu: gpu ? gpu.percent : null,
    gpuLabel: gpu ? `${(gpu.usedMB / 1024).toFixed(1)}/${(gpu.totalMB / 1024).toFixed(1)} GB` : null,
    ramLabel: `${((os.totalmem() - os.freemem()) / 1e9).toFixed(1)}/${(os.totalmem() / 1e9).toFixed(1)} GB`,
    cores: os.cpus().length,
  };
}

module.exports = { cpuPercent, ramPercent, gpuVram, snapshot };
