"use strict";

/**
 * trace-recorder.js — CODEGA AI Execution Memory
 *
 * Her ajan çağrısını (girdi, çıktı, başarı/hata, süre) JSONL
 * dosyasına kaydeder. Circular buffer: max MAX_TRACES satır.
 */

const fsp    = require("node:fs/promises");
const path   = require("node:path");
const crypto = require("node:crypto");

const MAX_TRACES = 500;

class TraceRecorder {
  constructor(dataDir) {
    this._path  = path.join(dataDir, "traces.jsonl");
    this._cache = null;
  }

  /** Dizin + boş dosya oluştur (idempotent) */
  async init() {
    await fsp.mkdir(path.dirname(this._path), { recursive: true });
    try { await fsp.access(this._path); }
    catch { await fsp.writeFile(this._path, "", "utf8"); }
  }

  /**
   * Yeni trace kaydı ekle.
   * @param {string} agentId      — "builder" | "git" | "plugin" | ...
   * @param {object} input        — ajan girdi nesnesi
   * @param {object|Error} output — ajan çıktısı veya hata
   * @param {boolean} success
   * @param {number}  durationMs
   * @returns {object} trace
   */
  async record(agentId, input, output, success, durationMs = 0) {
    const trace = {
      id:           crypto.randomBytes(6).toString("hex"),
      agentId,
      inputHash:    _hashInput(input),
      inputContext: _extractContext(agentId, input),
      success:      Boolean(success),
      errorCode:    success
                      ? null
                      : (output?.code || output?.message || String(output) || "unknown")
                          .slice(0, 120),
      durationMs,
      ts: Date.now(),
    };

    await fsp.appendFile(this._path, JSON.stringify(trace) + "\n", "utf8");
    this._cache = null;
    await this._trim();
    return trace;
  }

  /**
   * Son n trace'i döndür.
   * @param {string} agentId — "*" = tüm ajanlar
   */
  async recent(agentId = "*", n = 50) {
    const all      = await this._load();
    const filtered = agentId === "*" ? all : all.filter(t => t.agentId === agentId);
    return filtered.slice(-n);
  }

  /** Tüm trace'leri sil */
  async clear() {
    await fsp.writeFile(this._path, "", "utf8");
    this._cache = null;
  }

  // ── private ────────────────────────────────────────────────────

  async _load() {
    if (this._cache) return this._cache;
    try {
      const text = await fsp.readFile(this._path, "utf8");
      this._cache = text.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
    } catch {
      this._cache = [];
    }
    return this._cache;
  }

  async _trim() {
    const all = await this._load();
    if (all.length <= MAX_TRACES) return;
    const trimmed = all.slice(-MAX_TRACES);
    await fsp.writeFile(
      this._path,
      trimmed.map(t => JSON.stringify(t)).join("\n") + "\n",
      "utf8"
    );
    this._cache = trimmed;
  }
}

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────

function _hashInput(input) {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  return crypto.createHash("sha1").update(str).digest("hex").slice(0, 12);
}

function _extractContext(agentId, input) {
  if (!input || typeof input !== "object") return { agentId };
  return {
    agentId,
    stack:    input.stack || input.type || null,
    features: Array.isArray(input.features) ? input.features.slice(0, 8) : [],
    database: input.database || null,
  };
}

module.exports = TraceRecorder;
