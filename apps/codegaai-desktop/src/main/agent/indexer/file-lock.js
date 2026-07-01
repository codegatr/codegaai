"use strict";

/**
 * file-lock.js — O_EXCL tabanlı dayanıklı dosya kilidi.
 *
 * - fs.open(..., 'wx') = O_CREAT | O_EXCL | O_WRONLY → atomik "varsa başarısız".
 * - Metadata: pid, hostname, startedAt, ttlMs, workspaceRoot, operationId, owner, bootId.
 * - Stale tespiti: TTL aşıldı + PID ölü → çalınabilir.
 * - PID reuse koruması: yalnız pid'e güvenme; owner/bootId imzası + hostname +
 *   (sert TTL) ile sahte-canlı PID'e karşı korun.
 * - workspaceRoot içinde `.release.lock` varsa indexer çalışmaz: defer state yazılır.
 *
 * Saf Node (Electron yok). Senkron acquire/release; retry event-loop'u bloklamaz
 * (çağıran setTimeout ile dener — burada acquire tek deneme + opsiyonel steal).
 */

const fs   = require("node:fs");
const os   = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

// Bu PROCESS örneğine özgü imza — PID yeniden kullanımına karşı kimlik.
const BOOT_ID = crypto.randomUUID();
const HOSTNAME = os.hostname();

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // sinyal yok, yalnız varlık testi
    return true;
  } catch (e) {
    if (e && e.code === "EPERM") return true; // var ama izin yok
    return false; // ESRCH = yok
  }
}

function readLockMeta(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    const meta = JSON.parse(raw);
    return meta && typeof meta === "object" ? meta : null;
  } catch (_e) {
    return null; // okunamıyor/bozuk → çağıran "stale/corrupt" muamelesi yapar
  }
}

/**
 * Bir kilit metası bayat (çalınabilir) mı?
 * @returns {{stale:boolean, reason:string}}
 */
function evaluateStale(meta, now = Date.now()) {
  if (!meta || typeof meta !== "object") return { stale: true, reason: "corrupt_meta" };
  const ttl = Number(meta.ttlMs) > 0 ? Number(meta.ttlMs) : 0;
  const startedAt = Number(meta.startedAt) || 0;
  const ageMs = now - startedAt;

  if (ttl > 0 && ageMs <= ttl) return { stale: false, reason: "within_ttl" };

  // TTL aşıldı. PID canlı mı?
  const sameHost = meta.hostname === HOSTNAME;
  if (!sameHost) {
    // Başka makinenin PID'ini test edemeyiz; TTL aştıysa bayat say.
    return { stale: true, reason: "ttl_exceeded_foreign_host" };
  }
  if (!isProcessAlive(Number(meta.pid))) {
    return { stale: true, reason: "ttl_exceeded_pid_dead" };
  }
  // PID canlı ama TTL aşılmış: PID reuse VEYA hung process olabilir.
  // Sert tavan (2× ttl) aşıldıysa, PID reuse'a karşı bayat kabul et.
  if (ttl > 0 && ageMs > ttl * 2) return { stale: true, reason: "hard_ttl_exceeded_possible_pid_reuse" };
  return { stale: false, reason: "ttl_exceeded_pid_alive" };
}

function releaseLockPath(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot || "."), ".release.lock");
}

function writeMetaExclusive(lockPath, meta) {
  // 'wx' = O_CREAT|O_EXCL|O_WRONLY. Varsa EEXIST fırlatır (atomik).
  const fd = fs.openSync(lockPath, "wx");
  try {
    fs.writeFileSync(fd, JSON.stringify(meta, null, 2), "utf8");
    try { fs.fsyncSync(fd); } catch (_e) {}
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Kilit al.
 * @param {object} o
 * @param {string} o.lockPath
 * @param {string} o.workspaceRoot
 * @param {number} [o.ttlMs=600000]
 * @param {string} [o.operationId]
 * @param {boolean} [o.allowSteal=true]  bayat kilidi devral
 * @returns {{ok:boolean, lock?:object, reason?:string, holder?:object, deferred?:boolean}}
 */
function acquire(o = {}) {
  const lockPath = String(o.lockPath || "");
  const workspaceRoot = String(o.workspaceRoot || "");
  if (!lockPath || !workspaceRoot) return { ok: false, reason: "missing_args" };
  const ttlMs = Number(o.ttlMs) > 0 ? Number(o.ttlMs) : 600000;
  const allowSteal = o.allowSteal !== false;

  // 1) release-lock varsa indexer çalışmaz → defer.
  const relLock = releaseLockPath(workspaceRoot);
  if (fs.existsSync(relLock)) {
    try {
      fs.writeFileSync(`${lockPath}.deferred`, JSON.stringify({
        deferredAt: Date.now(), reason: "release_in_progress", releaseLock: relLock,
      }, null, 2), "utf8");
    } catch (_e) {}
    return { ok: false, deferred: true, reason: "release_in_progress" };
  }

  const meta = {
    pid: process.pid,
    hostname: HOSTNAME,
    bootId: BOOT_ID,
    owner: crypto.randomUUID(),
    startedAt: Date.now(),
    ttlMs,
    workspaceRoot: path.resolve(workspaceRoot),
    operationId: String(o.operationId || ""),
  };

  try {
    writeMetaExclusive(lockPath, meta);
    return { ok: true, lock: { path: lockPath, owner: meta.owner, meta } };
  } catch (e) {
    if (!e || e.code !== "EEXIST") return { ok: false, reason: e && e.code ? e.code : "open_failed" };
  }

  // EEXIST: mevcut kilidi değerlendir.
  const existing = readLockMeta(lockPath);
  const verdict = evaluateStale(existing);
  if (!verdict.stale) {
    return { ok: false, reason: "held", holder: existing || null };
  }
  if (!allowSteal) {
    return { ok: false, reason: `stale:${verdict.reason}`, holder: existing || null };
  }

  // Bayat kilidi devral: sil + tekrar atomik oluştur. Yarış olursa (başkası
  // araya girip oluşturduysa) EEXIST tekrar → held döndür.
  try { fs.unlinkSync(lockPath); } catch (_e) { /* zaten gitmiş olabilir */ }
  try {
    writeMetaExclusive(lockPath, meta);
    return { ok: true, lock: { path: lockPath, owner: meta.owner, meta }, stolenFrom: existing || null, stealReason: verdict.reason };
  } catch (e2) {
    return { ok: false, reason: e2 && e2.code === "EEXIST" ? "raced" : "steal_failed", holder: readLockMeta(lockPath) };
  }
}

/**
 * Kilidi bırak — yalnız BİZE ait kilidi siler (owner imzası eşleşirse).
 * @returns {boolean} silindi mi
 */
function release(lock) {
  if (!lock || !lock.path) return false;
  const onDisk = readLockMeta(lock.path);
  if (onDisk && onDisk.owner && lock.owner && onDisk.owner !== lock.owner) {
    return false; // başkasının kilidi — dokunma
  }
  try { fs.unlinkSync(lock.path); return true; }
  catch (_e) { return false; }
}

module.exports = { acquire, release, evaluateStale, isProcessAlive, readLockMeta, releaseLockPath, BOOT_ID };
