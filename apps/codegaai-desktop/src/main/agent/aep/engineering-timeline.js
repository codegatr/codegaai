"use strict";

/**
 * engineering-timeline.js — Kalıcı Mühendislik Zaman Çizelgesi (AEP)
 *
 * CODEGA AI'nin "ne zaman ve NEDEN" mühendislik kararları aldığını hatırlaması
 * için kalıcı, ekleme-bazlı (append-only) bir olay günlüğü. Her release, PR,
 * mimari karar, migrasyon, çözülen regresyon ve "ders" bir timeline olayıdır.
 *
 * Tasarım: engineering-score.js ile aynı desen — dataDir altında tek JSON,
 * saf/test edilebilir yardımcılar + ince bir sınıf. Çalışan modülleri bozmaz;
 * tamamen additive. Aynı (type+version+title) olay iki kez eklenmez (idempotent).
 */

const fs   = require("node:fs");
const path = require("node:path");

const EVENT_TYPES = [
  "release",      // bir sürüm yayınlandı
  "pr",           // bir PR merge edildi
  "decision",     // mimari/teknik karar
  "migration",    // veri/mimari göçü
  "lesson",       // çıkarılan ders (bir daha aynı hatayı yapma)
  "bug",          // önemli bug
  "regression",   // çözülen regresyon
  "optimization", // başarılı optimizasyon
];

function nowId() {
  return `tl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function slug(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").slice(0, 80);
}

/**
 * Bir timeline olayı kur (saf). Geçersiz tip/başlık reddedilir.
 * @param {{type:string,title:string,version?:string,ref?:string,why?:string,at?:number,tags?:string[]}} input
 */
function createEvent(input = {}) {
  const type = String(input.type || "").trim();
  if (!EVENT_TYPES.includes(type)) throw new Error(`Timeline: geçersiz tip "${type}"`);
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Timeline: title zorunlu");
  const at = Number(input.at);
  return {
    id: nowId(),
    type,
    title,
    version: String(input.version || "").trim(),
    ref: String(input.ref || "").trim(),            // PR/commit/issue
    why: String(input.why || "").trim(),            // KARAR GEREKÇESİ
    tags: Array.isArray(input.tags) ? input.tags.map((t) => slug(t)).filter(Boolean) : [],
    at: Number.isFinite(at) && at > 0 ? at : Date.now(),
  };
}

// İki olay "aynı" mı? (idempotent ekleme için): tip + version + normalize başlık.
function eventKey(e) {
  return `${e.type}|${slug(e.version)}|${slug(e.title)}`;
}

class EngineeringTimeline {
  constructor(dataDir) {
    this._filePath = path.join(dataDir || ".", "engineering-timeline.json");
    this._events = [];
  }

  init() {
    try {
      if (fs.existsSync(this._filePath)) {
        const raw = JSON.parse(fs.readFileSync(this._filePath, "utf8"));
        this._events = Array.isArray(raw.events) ? raw.events : [];
      }
    } catch (_e) {
      this._events = [];
    }
    return this;
  }

  _persist() {
    try {
      fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
      fs.writeFileSync(this._filePath, JSON.stringify({ events: this._events.slice(-1000) }, null, 2), "utf8");
    } catch (_e) { /* yazılamazsa sessiz geç — timeline kritik yol değil */ }
  }

  /** Olay ekle (idempotent). Var olan anahtar tekrar eklenmez. */
  add(input) {
    const event = createEvent(input);
    const key = eventKey(event);
    if (this._events.some((e) => eventKey(e) === key)) {
      return this._events.find((e) => eventKey(e) === key);
    }
    this._events.push(event);
    this._events.sort((a, b) => a.at - b.at);
    this._persist();
    return event;
  }

  /** Birden çok olayı yalnız boşsa/eksikse ekle (seed). */
  seed(events = []) {
    let added = 0;
    for (const e of events) {
      try {
        const before = this._events.length;
        this.add(e);
        if (this._events.length > before) added += 1;
      } catch (_e) { /* geçersiz seed olayını atla */ }
    }
    return added;
  }

  /** Filtrele: { type, version, tag, since, limit } */
  list(opts = {}) {
    let out = this._events.slice();
    if (opts.type) out = out.filter((e) => e.type === opts.type);
    if (opts.version) out = out.filter((e) => e.version === opts.version);
    if (opts.tag) { const t = slug(opts.tag); out = out.filter((e) => e.tags.includes(t)); }
    if (Number.isFinite(opts.since)) out = out.filter((e) => e.at >= opts.since);
    out.sort((a, b) => b.at - a.at); // en yeni önce
    const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? opts.limit : 100;
    return out.slice(0, limit);
  }

  summary() {
    const byType = {};
    for (const e of this._events) byType[e.type] = (byType[e.type] || 0) + 1;
    const sorted = this._events.slice().sort((a, b) => a.at - b.at);
    return {
      total: this._events.length,
      byType,
      firstAt: sorted[0]?.at || null,
      lastAt: sorted[sorted.length - 1]?.at || null,
      latest: this.list({ limit: 5 }),
    };
  }
}

module.exports = { EngineeringTimeline, createEvent, eventKey, EVENT_TYPES };
