"use strict";

/**
 * aep/path-guard.js — Otonom Patch Yol Koruması (AEP güvenlik kapısı)
 *
 * CODEGA_RULES §Autonomous Development: "Block workflows, secrets, credentials,
 * updater internals, preload internals, and settings stores in autonomous mode."
 *
 * patch-generator LLM'den [{path, content}] alır ve doğrudan GitHub'a push eder.
 * LLM halüsinasyonu ya da analiz edilen içerikten sızan prompt-injection, otonom hattı
 * .github/workflows, preload.js, settings-store.js, .env gibi DOKUNMASI YASAK dosyalara
 * ya da depo kökünden kaçan (../ traversal / mutlak) yollara yönlendirebilir. Bu modül
 * o yolları reddeder. Saf + dil-agnostik + test edilebilir.
 *
 * KURAL: Bu kapı YALNIZ daraltır — meşru patch'ler (src/**, __tests__, docs) geçer.
 */

const BLOCK_REASON = Object.freeze({
  EMPTY_PATH    : "empty-path",
  ABSOLUTE_PATH : "absolute-path",
  PATH_TRAVERSAL: "path-traversal",
  WORKFLOW      : "workflow",
  SECRET        : "secret",
  CREDENTIAL    : "credential",
  UPDATER       : "updater-internal",
  PRELOAD       : "preload-internal",
  SETTINGS_STORE: "settings-store",
});

// Yol normalizasyonu: ters eğik çizgi → düz, tekrarlı /, baştaki ./ temizlenir.
function normalizePatchPath(p) {
  return String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "");
}

/**
 * Tek bir yolu sınıflandır.
 * @param {string} rawPath
 * @returns {{ allowed: boolean, reason: string|null, path: string }}
 */
function classifyPatchPath(rawPath) {
  const p = normalizePatchPath(rawPath);
  if (!p) return { allowed: false, reason: BLOCK_REASON.EMPTY_PATH, path: p };

  // Mutlak yol (POSIX /… veya Windows C:\ / C:/) — patch yolu depo-göreli olmalı.
  if (/^\//.test(p) || /^[a-zA-Z]:\//.test(p)) {
    return { allowed: false, reason: BLOCK_REASON.ABSOLUTE_PATH, path: p };
  }
  // Path traversal — hiçbir segment ".." olamaz (depo kökünden kaçış).
  if (p.split("/").some((seg) => seg === "..")) {
    return { allowed: false, reason: BLOCK_REASON.PATH_TRAVERSAL, path: p };
  }

  const lower = p.toLowerCase();

  // 1) CI/CD workflow tanımları
  if (/(^|\/)\.github\/workflows\//.test(lower) || /(^|\/)\.gitlab-ci\.yml$/.test(lower)) {
    return { allowed: false, reason: BLOCK_REASON.WORKFLOW, path: p };
  }
  // 2) Sırlar / özel anahtarlar / .env
  if (/(^|\/)\.env(\.|$)/.test(lower)
      || /\.(pem|key|pfx|p12|keystore|jks)$/.test(lower)
      || /(^|\/)(id_rsa|id_ed25519|id_dsa)(\.|$)/.test(lower)) {
    return { allowed: false, reason: BLOCK_REASON.SECRET, path: p };
  }
  // 3) Kimlik/credential depoları
  if (/(secret|credential|\.npmrc|\.netrc|htpasswd)/.test(lower)) {
    return { allowed: false, reason: BLOCK_REASON.CREDENTIAL, path: p };
  }
  // 4) Güncelleyici (updater) iç dosyaları + electron-builder update meta
  if (/update-service\.(js|ts)$/.test(lower)
      || /(^|\/)(app-update\.yml|dev-app-update\.yml)$/.test(lower)
      || /(^|\/)latest[^/]*\.yml$/.test(lower)
      || /(^|\/)updater[^/]*\.(js|ts|json|ya?ml)$/.test(lower)) {
    return { allowed: false, reason: BLOCK_REASON.UPDATER, path: p };
  }
  // 5) Preload iç dosyaları (renderer↔main IPC köprüsü)
  if (/(^|\/)preload[^/]*\.(js|ts)$/.test(lower)) {
    return { allowed: false, reason: BLOCK_REASON.PRELOAD, path: p };
  }
  // 6) Ayar depoları
  if (/settings-store\.(js|ts)$/.test(lower)
      || /(^|\/)agent-settings\.json$/.test(lower)) {
    return { allowed: false, reason: BLOCK_REASON.SETTINGS_STORE, path: p };
  }

  return { allowed: true, reason: null, path: p };
}

/**
 * Bir patch setini denetle.
 * @param {Array<{path:string}>} patches
 * @returns {{ ok: boolean, blocked: Array<{path:string, reason:string}>, allowed: string[] }}
 */
function guardPatchSet(patches = []) {
  const blocked = [];
  const allowed = [];
  for (const patch of Array.isArray(patches) ? patches : []) {
    const verdict = classifyPatchPath(patch && patch.path);
    if (verdict.allowed) allowed.push(verdict.path);
    else blocked.push({ path: verdict.path, reason: verdict.reason });
  }
  return { ok: blocked.length === 0, blocked, allowed };
}

module.exports = { classifyPatchPath, guardPatchSet, normalizePatchPath, BLOCK_REASON };
