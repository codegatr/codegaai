"use strict";

/**
 * execution-memory.js — CODEGA AI Execution Memory (Singleton)
 *
 * Nirvana Directive: Sprint 9
 * "ne denedim → ne oldu → neden oldu → bir dahaki sefere ne yapmalıyım"
 *
 * Kullanım (herhangi bir ajanda):
 *
 *   const { executionMemory } = require("../memory/execution-memory");
 *
 *   // Ajan çalışmasını kaydet
 *   await executionMemory.record("builder", spec, result, true, durationMs);
 *
 *   // Bir sonraki çağrıda ipucu al
 *   const hints = await executionMemory.query({ agentId: "builder", stack: "express" });
 *   // hints → [{ lesson: "...", confidence: 0.87 }, ...]
 *
 * main.js'de ilk başlatma:
 *   const { initExecutionMemory } = require("./agent/memory/execution-memory");
 *   await initExecutionMemory(path.join(app.getPath("userData"), "execution-memory"));
 */

const path             = require("node:path");
const os               = require("node:os");
const TraceRecorder    = require("./trace-recorder");
const PatternExtractor = require("./pattern-extractor");
const RuleStore        = require("./rule-store");

// ── Default data dir (Electron userData override edilmeden önce) ──
const DEFAULT_DATA_DIR = path.join(os.homedir(), ".codegaai", "execution-memory");

class ExecutionMemory {
  constructor(dataDir = DEFAULT_DATA_DIR) {
    this._dataDir    = dataDir;
    this._recorder   = new TraceRecorder(dataDir);
    this._extractor  = new PatternExtractor();
    this._store      = new RuleStore(dataDir);
    this._ready      = false;
  }

  /** Diskten yükle — app başlangıcında çağrılmalı */
  async init() {
    if (this._ready) return this;
    await this._recorder.init();
    await this._store.init();
    this._ready = true;
    return this;
  }

  /**
   * Ajan çalışmasını kaydet ve yeni kurallar çıkar.
   *
   * @param {string}        agentId
   * @param {object}        input       — ajan girdi spec'i
   * @param {object|Error}  output      — ajan çıktısı veya hata nesnesi
   * @param {boolean}       success
   * @param {number}        [durationMs]
   * @returns {object} trace
   */
  async record(agentId, input, output, success, durationMs = 0) {
    await this.init();

    // 1. Trace kaydet
    const trace = await this._recorder.record(agentId, input, output, success, durationMs);

    // 2. Son 50 trace'ten örüntü çıkar
    try {
      const recent     = await this._recorder.recent(agentId, 50);
      const candidates = this._extractor.analyze(recent);
      for (const candidate of candidates) {
        await this._store.upsert(candidate);
      }
      await this._store.prune();
    } catch {
      // Hafıza modülü hiçbir zaman ana akışı patlatmamalı
    }

    return trace;
  }

  /**
   * Bağlama uyan aktif kuralları döndür.
   * Ajan prompt'una "Şunları bil:" şeklinde enjekte edilebilir.
   *
   * @param {{ agentId?, stack?, features?, database? }} context
   * @returns {object[]} rules (max 5)
   */
  async query(context = {}) {
    await this.init();
    return this._store.query(context);
  }

  /**
   * Hafıza istatistikleri.
   * @returns {{ totalTraces, totalRules, activeRules, dataDir }}
   */
  async stats() {
    await this.init();
    const traces = await this._recorder.recent("*", 500);
    const rules  = this._store.list();
    return {
      totalTraces:  traces.length,
      totalRules:   rules.length,
      activeRules:  rules.filter(r => r.active).length,
      dataDir:      this._dataDir,
    };
  }

  /** Tüm hafızayı sıfırla (test / debug için) */
  async reset() {
    await this.init();
    await this._recorder.clear();
    await this._store.clear();
  }

  /** Ham erişim — test için */
  get recorder() { return this._recorder; }
  get store()    { return this._store;    }
}

// ── Singleton yönetimi ────────────────────────────────────────────

let _instance = null;

/**
 * Singleton'ı oluştur veya döndür.
 * @param {string} [dataDir]
 */
function getExecutionMemory(dataDir) {
  if (!_instance) {
    _instance = new ExecutionMemory(dataDir || DEFAULT_DATA_DIR);
  }
  return _instance;
}

/**
 * main.js'den çağrılır — Electron userData yolunu enjekte eder.
 * @param {string} dataDir
 */
async function initExecutionMemory(dataDir) {
  _instance = new ExecutionMemory(dataDir);
  await _instance.init();
  return _instance;
}

/** Modül düzeyinde hazır singleton (ajan dosyaları doğrudan import edebilir) */
const executionMemory = {
  async record(...args) { return getExecutionMemory().record(...args); },
  async query(...args)  { return getExecutionMemory().query(...args);  },
  async stats()         { return getExecutionMemory().stats();         },
};

module.exports = { ExecutionMemory, getExecutionMemory, initExecutionMemory, executionMemory };
