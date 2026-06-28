"use strict";
/**
 * agent/installer.js
 * -------------------
 * Tüm platformlarda Ollama'yı otomatik kurar ve başlatır.
 * - Windows: winget → OllamaSetup.exe /SILENT (GUI yok)
 * - macOS:   brew → Ollama-darwin.zip indir → ~/Applications'a kur → open
 * - Linux:   resmi curl | sh betiği
 *
 * GÜVENLİK: Kurulum YALNIZCA kullanıcı onayından sonra başlar.
 */

const { spawn } = require("child_process");
const os   = require("os");
const path = require("path");
const fs   = require("fs");

// Yaklaşık model boyutları (GB) — kullanıcıya bilgi için
const MODEL_SIZE_GB = {
  "qwen3:1.7b"              : 1.4,
  "qwen3:4b"                : 2.5,
  "qwen3:8b"                : 5.2,
  "qwen3:14b"               : 9.3,
  "qwen3.5:4b"              : 2.5,
  "qwen3.5:8b"              : 5.2,
  "qwen2.5-coder:3b"        : 1.9,
  "qwen2.5-coder:7b"        : 4.7,
  "qwen2.5:1.5b"            : 1.0,
  "qwen2.5:3b"              : 1.9,
  "qwen2.5-coder:3b-instruct": 1.9,
  "qwen2.5-coder:7b-instruct": 4.7,
  "llama3.2:3b"             : 2.0,
  "mistral:7b"              : 4.1,
  "gemma3:4b"               : 3.3,
  "nomic-embed-text"        : 0.3,
};
function modelSizeGb(id) { return MODEL_SIZE_GB[id] || null; }

function ollamaInstallerUrl() {
  if (process.platform === "win32")  return "https://ollama.com/download/OllamaSetup.exe";
  if (process.platform === "darwin") return "https://ollama.com/download/Ollama-darwin.zip";
  return "https://ollama.com/install.sh";
}

async function headSize(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    const len = res.headers.get("content-length");
    return len ? parseInt(len, 10) : null;
  } catch (_e) { return null; }
}

function run(cmd, args, { onData, timeoutMs = 0, detached = false } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "";
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, detached });
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
  const base = process.platform === "win32" ? "ollama.exe" : "ollama";
  const candidates = [base];
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const pf    = process.env.ProgramFiles  || "";
    if (local) candidates.unshift(
      path.join(local, "Programs", "Ollama", "ollama.exe"),
      path.join(local, "Ollama", "ollama.exe")
    );
    if (pf) candidates.unshift(path.join(pf, "Ollama", "ollama.exe"));
  } else if (process.platform === "darwin") {
    candidates.unshift(
      "/Applications/Ollama.app/Contents/Resources/ollama",
      path.join(os.homedir(), "Applications/Ollama.app/Contents/Resources/ollama"),
      "/opt/homebrew/bin/ollama",
      "/usr/local/bin/ollama"
    );
  } else {
    candidates.unshift("/usr/local/bin/ollama", "/usr/bin/ollama");
  }
  return [...new Set(candidates)];
}

function findOllamaCommand() {
  return ollamaCommandCandidates().find((c) =>
    c === "ollama" || c === "ollama.exe" || fs.existsSync(c)
  ) || (process.platform === "win32" ? "ollama.exe" : "ollama");
}

async function detectOllama() {
  const cmd = process.platform === "win32" ? "ollama.exe" : "ollama";
  const r = await run(cmd, ["--version"], { timeoutMs: 6000 });
  if (r.ok && /ollama|version|\d+\.\d+/i.test(`${r.out}${r.err}`)) return true;
  // macOS: ayrıca .app içindeki binary'yi dene
  if (process.platform === "darwin") {
    for (const p of [
      "/Applications/Ollama.app/Contents/Resources/ollama",
      path.join(os.homedir(), "Applications/Ollama.app/Contents/Resources/ollama"),
    ]) {
      if (fs.existsSync(p)) {
        const r2 = await run(p, ["--version"], { timeoutMs: 6000 });
        if (r2.ok) return true;
      }
    }
  }
  return false;
}

/** Ollama serve'i arka planda başlat (zaten çalışıyorsa NO-OP) */
async function ensureOllamaServing() {
  if (process.platform === "darwin") {
    // Ollama.app açıksa MenuBar'da serve başlar
    await run("open", ["-a", "Ollama"], { timeoutMs: 8000 }).catch(() => {});
  } else if (process.platform === "win32") {
    const cmd = findOllamaCommand();
    spawn(cmd, ["serve"], { detached: true, windowsHide: true, stdio: "ignore" }).unref();
  } else {
    spawn("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref();
  }
}

/** Ollama'nın hazır olmasını bekle */
async function waitForOllama(maxWaitMs = 90000, intervalMs = 2000, onData) {
  const log = (s) => { if (onData) onData(String(s)); };
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    if (await detectOllama()) return true;
    attempt++;
    if (attempt % 5 === 0) log(`Ollama başlatılıyor... (${Math.round((Date.now() - (deadline - maxWaitMs)) / 1000)}sn)`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function hasCommand(cmd) {
  const probe = process.platform === "win32"
    ? run("powershell.exe", ["-NoProfile", "-Command",
        `Get-Command ${cmd} -ErrorAction SilentlyContinue | Out-Null; if($?){exit 0}else{exit 1}`],
        { timeoutMs: 8000 })
    : run("bash", ["-c", `command -v ${cmd} >/dev/null 2>&1`], { timeoutMs: 6000 });
  return (await probe).ok;
}

/** Dosya indir */
async function downloadFile(url, dest, onData) {
  const log = (s) => { if (onData) onData(String(s)); };
  log(`İndiriliyor: ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`İndirme hatası HTTP ${res.status}`);
  const total  = parseInt(res.headers.get("content-length") || "0", 10);
  let received = 0;
  const chunks = [];
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total && received % (5 * 1024 * 1024) < value.length) {
      log(`${Math.round(received / 1024 / 1024)} / ${Math.round(total / 1024 / 1024)} MB`);
    }
  }
  fs.writeFileSync(dest, Buffer.concat(chunks));
  log(`İndirme tamamlandı: ${dest}`);
}

/**
 * Ollama'yı kur.
 * Dönüş: { ok, method, message? }
 */
async function installOllama(onData) {
  const log = (s) => { if (onData) onData(String(s)); };

  // ── Windows ─────────────────────────────────────────────────────────────────
  if (process.platform === "win32") {
    // 1) winget
    if (await hasCommand("winget")) {
      log("winget ile sessiz kurulum başlıyor…");
      const r = await run("powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
         "winget install -e --id Ollama.Ollama --silent --accept-source-agreements --accept-package-agreements"],
        { onData, timeoutMs: 20 * 60 * 1000 }
      );
      if (r.ok) {
        await ensureOllamaServing();
        const ready = await waitForOllama(30000, 2000, onData);
        return { ok: ready, method: "winget" };
      }
      log("winget başarısız, resmi kurucu yöntemi deneniyor…");
    }
    // 2) OllamaSetup.exe /SILENT
    try {
      const dest = path.join(os.tmpdir(), "OllamaSetup.exe");
      await downloadFile(ollamaInstallerUrl(), dest, onData);
      log("Sessiz kurulum çalıştırılıyor…");
      const r = await run(dest, ["/SILENT", "/NORESTART"], { timeoutMs: 10 * 60 * 1000 });
      if (!r.ok) throw new Error(r.err || `exit ${r.code}`);
      await ensureOllamaServing();
      const ready = await waitForOllama(45000, 2000, onData);
      return { ok: ready, method: "exe" };
    } catch (e) {
      return { ok: false, message: "Windows kurulumu başarısız: " + (e.message || e) };
    }
  }

  // ── macOS ────────────────────────────────────────────────────────────────────
  if (process.platform === "darwin") {
    // 1) Homebrew
    if (await hasCommand("brew")) {
      log("Homebrew ile kuruluyor…");
      const r = await run("bash", ["-c", "brew install ollama"], { onData, timeoutMs: 20 * 60 * 1000 });
      if (r.ok) {
        // brew services ile başlat
        await run("bash", ["-c", "brew services start ollama"], { timeoutMs: 15000 }).catch(() => {});
        await ensureOllamaServing();
        const ready = await waitForOllama(30000, 2000, onData);
        return { ok: ready, method: "brew" };
      }
      log("brew başarısız, ZIP yöntemiyle devam ediliyor…");
    }
    // 2) Ollama-darwin.zip indir → ~/Applications'a kur → open
    try {
      const zipDest = path.join(os.tmpdir(), "Ollama-darwin.zip");
      await downloadFile(ollamaInstallerUrl(), zipDest, onData);

      log("Arşiv açılıyor…");
      const unzipDir = path.join(os.tmpdir(), "ollama-unzip");
      fs.mkdirSync(unzipDir, { recursive: true });
      const unzip = await run("unzip", ["-o", zipDest, "-d", unzipDir], { timeoutMs: 120000 });
      if (!unzip.ok) throw new Error("unzip başarısız: " + unzip.err);

      const appSrc = path.join(unzipDir, "Ollama.app");
      if (!fs.existsSync(appSrc)) throw new Error("Ollama.app arşivde bulunamadı.");

      // ~/Applications önce dene (sudo gerektirmez), sonra /Applications
      const userApps   = path.join(os.homedir(), "Applications");
      const appDestUser = path.join(userApps, "Ollama.app");
      const appDestSys  = "/Applications/Ollama.app";
      let appDest = appDestUser;
      try {
        fs.mkdirSync(userApps, { recursive: true });
        log("~/Applications klasörüne kopyalanıyor…");
        await run("cp", ["-rf", appSrc, appDestUser], { timeoutMs: 60000 });
      } catch (_e) {
        log("/Applications klasörüne kopyalanıyor…");
        await run("cp", ["-rf", appSrc, appDestSys], { timeoutMs: 60000 });
        appDest = appDestSys;
      }

      log("Karantina bayrağı kaldırılıyor…");
      await run("xattr", ["-cr", appDest], { timeoutMs: 15000 }).catch(() => {});
      log("Ollama başlatılıyor…");
      await run("open", [appDest], { timeoutMs: 10000 });
      const ready = await waitForOllama(60000, 2000, onData);
      if (!ready) {
        return { ok: false, message: `Ollama ${appDest} konumuna kuruldu fakat başlatılamadı. Elle aç ve tekrar dene.` };
      }
      return { ok: true, method: "zip" };
    } catch (e) {
      return { ok: false, message: "macOS kurulumu başarısız: " + (e.message || e) };
    }
  }

  // ── Linux ────────────────────────────────────────────────────────────────────
  log("Resmi kurulum betiği çalıştırılıyor (curl | sh)…");
  const r = await run("bash", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"],
    { onData, timeoutMs: 20 * 60 * 1000 });
  if (r.ok) {
    await ensureOllamaServing();
    const ready = await waitForOllama(30000, 2000, onData);
    return { ok: ready, method: "script" };
  }
  return { ok: false, message: "Linux kurulumu başarısız: " + (r.err || r.out).slice(0, 200) };
}

async function persistOllamaModelsPath(modelsPath) {
  const raw = String(modelsPath || "").trim();
  if (!raw) throw new Error("Model dizini boş olamaz.");
  const value = path.resolve(raw);
  process.env.OLLAMA_MODELS = value;
  if (process.platform === "win32") {
    const escaped = value.replace(/'/g, "''");
    const result = await run("powershell.exe",
      ["-NoProfile", "-Command",
       `[Environment]::SetEnvironmentVariable('OLLAMA_MODELS','${escaped}','User')`],
      { timeoutMs: 15000 });
    if (!result.ok) throw new Error("Windows kullanıcı model dizini ayarı kaydedilemedi.");
  }
  return value;
}

async function stopOllama() {
  if (process.platform === "win32") {
    await run("taskkill.exe", ["/F", "/IM", "ollama.exe"], { timeoutMs: 12000 });
  } else {
    await run("pkill", ["-f", "ollama serve"], { timeoutMs: 12000 });
    await run("pkill", ["-f", "ollama runner"], { timeoutMs: 5000 }).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 900));
  return { ok: true };
}

async function restartOllama(modelsPath) {
  const env = { ...process.env, OLLAMA_MODELS: path.resolve(modelsPath) };
  await stopOllama();
  const command = findOllamaCommand();
  const child = spawn(command, ["serve"], {
    detached: true, windowsHide: true, stdio: "ignore", env,
  });
  child.unref();
  return { ok: true, command };
}

module.exports = {
  detectOllama,
  ensureOllamaServing,
  findOllamaCommand,
  hasCommand,
  headSize,
  installOllama,
  modelSizeGb,
  ollamaInstallerUrl,
  persistOllamaModelsPath,
  restartOllama,
  stopOllama,
  waitForOllama,
};