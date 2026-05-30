"use strict";
/**
 * agent/code-runner.js
 * ---------------------
 * İNSAN ONAYLI kod çalıştırıcı. Ajan KENDİLİĞİNDEN kod çalıştırmaz; kullanıcı
 * gördüğü kodu "Çalıştır" diyerek tetikler. Geçici klasörde, zaman aşımıyla çalışır.
 *
 * NOT: Bu gerçek bir OS-sandbox DEĞİLDİR; kod kullanıcının yetkileriyle çalışır.
 * Güvenlik sınırı: çalıştırmayı yalnızca kullanıcı başlatır (otomatik değil).
 *
 * JS için Electron ikilisi ELECTRON_RUN_AS_NODE=1 ile Node gibi koşar (harici
 * node kurulumu gerekmez). Python için sistemde python3/python gerekir.
 */

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

const MAX_OUTPUT = 20000; // karakter

function clip(s) {
  s = String(s || "");
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n…(çıktı kısaltıldı)" : s;
}

function runCode(language, code, opts = {}) {
  const { timeoutMs = 15000 } = opts;
  return new Promise((resolve) => {
    const lang = String(language || "").toLowerCase();
    let dir;
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-run-"));
    } catch (e) {
      return resolve({ ok: false, stdout: "", stderr: "Geçici klasör açılamadı: " + e.message, exitCode: -1 });
    }

    let cmd;
    let args;
    let env = { ...process.env };
    try {
      if (lang === "python" || lang === "py") {
        const file = path.join(dir, "snippet.py");
        fs.writeFileSync(file, String(code || ""));
        cmd = process.platform === "win32" ? "python" : "python3";
        args = [file];
      } else if (lang === "javascript" || lang === "js" || lang === "node") {
        const file = path.join(dir, "snippet.js");
        fs.writeFileSync(file, String(code || ""));
        cmd = process.execPath; // Electron ikilisi
        env.ELECTRON_RUN_AS_NODE = "1"; // Node gibi koş
        args = [file];
      } else {
        return resolve({ ok: false, stdout: "", stderr: `Desteklenmeyen dil: ${language} (python/javascript)`, exitCode: -1 });
      }
    } catch (e) {
      return resolve({ ok: false, stdout: "", stderr: "Dosya yazılamadı: " + e.message, exitCode: -1 });
    }

    let stdout = "";
    let stderr = "";
    let done = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd: dir, env, windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, stdout: "", stderr: "Çalıştırılamadı: " + e.message, exitCode: -1 });
    }

    const timer = setTimeout(() => {
      if (done) return;
      try { child.kill("SIGKILL"); } catch (_e) {}
      done = true;
      resolve({ ok: false, stdout: clip(stdout), stderr: clip(stderr) + `\n⏱️ Zaman aşımı (${timeoutMs} ms) — süreç durduruldu.`, exitCode: -1, timedOut: true });
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); if (stdout.length > MAX_OUTPUT * 2) stdout = stdout.slice(0, MAX_OUTPUT * 2); });
    child.stderr.on("data", (d) => { stderr += d.toString(); if (stderr.length > MAX_OUTPUT * 2) stderr = stderr.slice(0, MAX_OUTPUT * 2); });
    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const hint = e.code === "ENOENT" ? ` (${cmd} bulunamadı — kurulu mu?)` : "";
      resolve({ ok: false, stdout: clip(stdout), stderr: "Çalıştırma hatası: " + e.message + hint, exitCode: -1 });
    });
    child.on("close", (codeExit) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: codeExit === 0, stdout: clip(stdout), stderr: clip(stderr), exitCode: codeExit });
    });
  });
}

module.exports = { runCode };
