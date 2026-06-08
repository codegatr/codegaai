"use strict";
/**
 * agent/installer.js
 * -------------------
 * İşletim sistemini algılayıp Ollama'yı KULLANICI ONAYIYLA kurar.
 * - Windows: PowerShell üzerinden winget (yoksa resmi OllamaSetup.exe indir+çalıştır)
 * - macOS:   brew (varsa); yoksa elle kurulum (imzalı .app gerekir)
 * - Linux:   resmi kurulum betiği (curl | sh)
 *
 * GÜVENLİK: Kurulum YALNIZCA kullanıcı onayından sonra başlar (çağıran taraf onaylar).
 * Boyut HEAD ile gerçek değer; model boyutu yaklaşık tablo.
 */

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

// Yaklaşık model indirme boyutları (GB) — kullanıcıya bilgi için
const MODEL_SIZE_GB = {
  "qwen3:1.7b": 1.4,
  "qwen3:4b": 2.5,
  "qwen3:8b": 5.2,
  "qwen3:14b": 9.3,
  "qwen2.5-coder:3b": 1.9,
  "qwen2.5-coder:7b": 4.7,
  "qwen2.5:1.5b": 1.0,
  "qwen2.5:3b": 1.9,
  "qwen2.5-coder:3b-instruct": 1.9,
  "qwen2.5-coder:7b-instruct": 4.7,
  "llama3.2:3b": 2.0,
  "mistral:7b": 4.1,
  "gemma3:4b": 3.3,
  "nomic-embed-text": 0.3,
};
function modelSizeGb(id) {
  return MODEL_SIZE_GB[id] || null;
}

function ollamaInstallerUrl() {
  if (process.platform === "win32") return "https://ollama.com/download/OllamaSetup.exe";
  if (process.platform === "darwin") return "https://ollama.com/download/Ollama-darwin.zip";
  return "https://ollama.com/install.sh";
}

/** URL'nin gerçek boyutunu (bytes) HEAD ile getir; bilinmiyorsa null. */
async function headSize(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    const len = res.headers.get("content-length");
    return len ? parseInt(len, 10) : null;
  } catch (_e) {
    return null;
  }
}

function run(cmd, args, { onData, timeoutMs = 0, detached = false } = {}) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: false, detached });
    } catch (e) {
      return resolve({ ok: false, code: -1, out: "", err: String(e.message || e) });
    }
    const timer = timeoutMs ? setTimeout(() => { try { child.kill(); } catch (_e) {} }, timeoutMs) : null;
    if (child.stdout) child.stdout.on("data", (d) => { out += d; if (onData) onData(d.toString()); });
    if (child.stderr) child.stderr.on("data", (d) => { err += d; if (onData) onData(d.toString()); });
    child.on("error", (e) => { if (timer) clearTimeout(timer); resolve({ ok: false, code: -1, out, err: String(e.message || e) }); });
    if (detached) { child.unref(); return resolve({ ok: true, code: 0, out: "", err: "", spawned: true }); }
    child.on("close", (code) => { if (timer) clearTimeout(timer); resolve({ ok: code === 0, code, out, err }); });
  });
}

function ollamaCommandCandidates() {
  const candidates = [process.platform === "win32" ? "ollama.exe" : "ollama"];
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "";
    if (local) candidates.unshift(
      path.join(local, "Programs", "Ollama", "ollama.exe"),
      path.join(local, "Ollama", "ollama.exe")
    );
    if (programFiles) candidates.unshift(path.join(programFiles, "Ollama", "ollama.exe"));
  } else if (process.platform === "darwin") {
    candidates.unshift("/Applications/Ollama.app/Contents/Resources/ollama", "/opt/homebrew/bin/ollama", "/usr/local/bin/ollama");
  } else {
    candidates.unshift("/usr/local/bin/ollama", "/usr/bin/ollama");
  }
  return [...new Set(candidates)];
}

function findOllamaCommand() {
  return ollamaCommandCandidates().find((candidate) => (
    candidate === "ollama" ||
    candidate === "ollama.exe" ||
    fs.existsSync(candidate)
  )) || (process.platform === "win32" ? "ollama.exe" : "ollama");
}

async function persistOllamaModelsPath(modelsPath) {
  const raw = String(modelsPath || "").trim();
  if (!raw) throw new Error("Model dizini boş olamaz.");
  const value = path.resolve(raw);
  process.env.OLLAMA_MODELS = value;
  if (process.platform === "win32") {
    const escaped = value.replace(/'/g, "''");
    const result = await run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `[Environment]::SetEnvironmentVariable('OLLAMA_MODELS','${escaped}','User')`,
    ], { timeoutMs: 15000 });
    if (!result.ok) throw new Error("Windows kullanıcı model dizini ayarı kaydedilemedi.");
  }
  return value;
}

async function stopOllama() {
  if (process.platform === "win32") {
    await run("taskkill.exe", ["/F", "/IM", "ollama.exe"], { timeoutMs: 12000 });
  } else {
    await run("pkill", ["-f", "ollama serve"], { timeoutMs: 12000 });
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
  return { ok: true };
}

async function restartOllama(modelsPath) {
  const env = { ...process.env, OLLAMA_MODELS: path.resolve(modelsPath) };
  await stopOllama();
  const command = findOllamaCommand();
  const child = spawn(command, ["serve"], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  return { ok: true, command };
}

/** Ollama kurulu mu? (`ollama --version`) */
async function detectOllama() {
  const r = await run(process.platform === "win32" ? "ollama.exe" : "ollama", ["--version"], { timeoutMs: 6000 });
  return r.ok && /ollama|version|\d+\.\d+/i.test(`${r.out}${r.err}`);
}

async function hasCommand(cmd) {
  const probe = process.platform === "win32"
    ? run("powershell.exe", ["-NoProfile", "-Command", `Get-Command ${cmd} -ErrorAction SilentlyContinue | Out-Null; if($?){exit 0}else{exit 1}`], { timeoutMs: 8000 })
    : run("bash", ["-c", `command -v ${cmd} >/dev/null 2>&1`], { timeoutMs: 6000 });
  const r = await probe;
  return r.ok;
}

/**
 * Ollama'yı kur. onData ile ilerleme satırları gelir.
 * Dönüş: { ok, method, needsManual?, message }
 */
async function installOllama(onData) {
  const log = (s) => { if (onData) onData(String(s)); };

  if (process.platform === "win32") {
    // 1) PowerShell + winget
    if (await hasCommand("winget")) {
      log("winget ile kuruluyor (yönetici onayı isteyebilir)…");
      const r = await run(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
         "winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements"],
        { onData, timeoutMs: 20 * 60 * 1000 }
      );
      if (r.ok) return { ok: true, method: "winget" };
      log("winget başarısız, resmi kurucu indiriliyor…");
    }
    // 2) Resmi OllamaSetup.exe indir + çalıştır (GUI kurulum)
    try {
      const url = ollamaInstallerUrl();
      const dest = path.join(os.tmpdir(), "OllamaSetup.exe");
      log("OllamaSetup.exe indiriliyor…");
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) return { ok: false, message: `İndirme hatası: HTTP ${res.status}` };
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      log("Kurulum başlatılıyor… açılan pencereden tamamla.");
      await run(dest, ["/SILENT"], { detached: true });
      return { ok: true, method: "exe", needsManual: true, message: "Kurulum penceresi açıldı; tamamlayıp tekrar dene." };
    } catch (e) {
      return { ok: false, message: "Kurulum indirilemedi: " + (e.message || e) };
    }
  }

  if (process.platform === "darwin") {
    if (await hasCommand("brew")) {
      log("Homebrew ile kuruluyor…");
      const r = await run("bash", ["-c", "brew install ollama"], { onData, timeoutMs: 20 * 60 * 1000 });
      if (r.ok) return { ok: true, method: "brew" };
    }
    return { ok: false, needsManual: true, message: "macOS'ta otomatik kurulum için Homebrew gerekir. Elle kurulum: ollama.com/download/mac" };
  }

  // Linux: resmi betik
  log("Resmi kurulum betiği çalıştırılıyor (curl | sh)…");
  const r = await run("bash", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], { onData, timeoutMs: 20 * 60 * 1000 });
  if (r.ok) return { ok: true, method: "script" };
  return { ok: false, message: "Linux kurulumu başarısız: " + (r.err || r.out).slice(0, 200) };
}

module.exports = {
  detectOllama,
  findOllamaCommand,
  hasCommand,
  headSize,
  installOllama,
  modelSizeGb,
  ollamaInstallerUrl,
  persistOllamaModelsPath,
  restartOllama,
  stopOllama,
};
