"use strict";
/**
 * Layer 6: Engineering Brain — Mühendislik Beyni
 * Her çözülen bug, her reddedilen çözüm, her başarısız yaklaşım,
 * her optimizasyon, her mimari karar → kalıcı bilgi.
 *
 * AEP'teki LearningDatabase ile senkronize çalışır.
 * Ama bu katman daha üst seviyede: "ne öğrendim" değil "ne biliyorum".
 */
const fs   = require("node:fs");
const path = require("node:path");

const KNOWLEDGE_TYPE = Object.freeze({
  BUG_PATTERN    : "bug_pattern",    // tekrarlayan hata kalıpları
  SOLUTION       : "solution",       // işe yarayan çözümler
  ANTIPATTERN    : "antipattern",    // kaçınılması gerekenler
  ARCH_DECISION  : "arch_decision",  // mimari kararlar ve gerekçeleri
  PERF_INSIGHT   : "perf_insight",   // performans dersleri
  SECURITY_RULE  : "security_rule",  // güvenlik kuralları
  TEST_STRATEGY  : "test_strategy",  // test yaklaşımları
  TOOL_USAGE     : "tool_usage",     // araç kullanım kalıpları
});

class EngineeringBrain {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._path    = path.join(dataDir, "engineering-brain.json");
    this._knowledge = new Map();  // id → KnowledgeItem
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._path)) {
        const raw = JSON.parse(fs.readFileSync(this._path, "utf8"));
        for (const k of (raw.knowledge || [])) this._knowledge.set(k.id, k);
      }
    } catch (e) {
      console.warn("[EngineeringBrain] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._path, JSON.stringify({
        version  : 1, savedAt: Date.now(),
        knowledge: [...this._knowledge.values()],
      }, null, 2), "utf8");
    } catch (e) { console.warn("[EngineeringBrain] save:", e.message); }
  }

  learn({ type, title, description, tags=[], confidence=0.8, source="observed" }={}) {
    if (!type || !title) throw new Error("KnowledgeItem: type ve title zorunlu");
    const id = `KB-${type}-${title.toLowerCase().replace(/\s+/g,"-").slice(0,30)}-${Date.now().toString(36)}`;

    // Benzer başlık varsa güven artır
    const dup = [...this._knowledge.values()].find(k =>
      k.title.toLowerCase() === title.toLowerCase() && k.type === type
    );
    if (dup) {
      dup.confidence = Math.min(1, dup.confidence + 0.05);
      dup.reinforceCount = (dup.reinforceCount || 0) + 1;
      dup.updatedAt = Date.now();
      this._save();
      return dup;
    }

    const item = {
      id, type, title: String(title).trim(),
      description: String(description || "").trim(),
      tags: Array.isArray(tags) ? tags : [],
      confidence: Math.min(1, Math.max(0, Number(confidence) || 0.8)),
      source, reinforceCount: 0, useCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    this._knowledge.set(id, item);
    this._save();
    return item;
  }

  query({ type=null, tag=null, minConfidence=0.5, limit=10 }={}) {
    let items = [...this._knowledge.values()];
    if (type) items = items.filter(k => k.type === type);
    if (tag)  items = items.filter(k => k.tags.includes(tag));
    items = items.filter(k => k.confidence >= minConfidence);
    return items.sort((a,b) => b.confidence - a.confidence).slice(0, limit);
  }

  relevantFor(context, limit=5) {
    const words = String(context||"").toLowerCase().split(/\s+/);
    return [...this._knowledge.values()]
      .map(k => {
        const score = words.filter(w => w.length > 3 &&
          (k.title.toLowerCase().includes(w) || k.description.toLowerCase().includes(w) ||
           k.tags.some(t => t.includes(w)))).length;
        return { k, score };
      })
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0, limit)
      .map(x => x.k);
  }

  /** LLM context'i için mühendislik bilgisi */
  contextFor(topic) {
    const relevant = this.relevantFor(topic, 3);
    if (!relevant.length) return "";
    const lines = ["# Mühendislik Bilgisi"];
    for (const k of relevant) lines.push(`- **${k.type}:** ${k.title}${k.description ? " — " + k.description.slice(0,100) : ""}`);
    return lines.join("\n");
  }

  summary() {
    const all = [...this._knowledge.values()];
    const byType = {};
    for (const k of all) byType[k.type] = (byType[k.type] || 0) + 1;
    return { total: all.length, byType, highConfidence: all.filter(k=>k.confidence>=0.9).length };
  }
}
module.exports = { EngineeringBrain, KNOWLEDGE_TYPE };
