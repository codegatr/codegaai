"use strict";

/**
 * cognitive-types.js — CODEGA AI Yapay Biliş Mimarisi Tip Tanımları
 *
 * Sprint ACE: Artificial Cognition Engine
 *
 * Temel İlke:
 *   İnsan mesajları hatırlamaz — anlam hatırlar.
 *   CODEGA AI chat log değil, anlayış biriktirmeli.
 */

// ── Bilişsel Katmanlar ────────────────────────────────────────────────────────

const COGNITIVE_LAYER = Object.freeze({
  L1_SENSORY     : "sensory",       // Anlık akış — saniyeler
  L2_WORKING     : "working",       // Aktif oturum — mevcut görev
  L3_CONVERSATION: "conversation",  // Semantik özet — sohbet boyunca
  L4_PROJECT     : "project",       // Proje beyni — kalıcı
  L5_USER        : "user",          // Kullanıcı beyni — kalıcı, büyüyen
  L6_ENGINEERING : "engineering",   // Mühendislik dersleri — kalıcı
  L7_WORLD       : "world",         // Genel bilgi — statik/sabit
});

// ── Life Graph Düğüm Türleri ──────────────────────────────────────────────────

const NODE_TYPE = Object.freeze({
  PERSON      : "person",       // Kullanıcı, geliştirici
  PROJECT     : "project",      // Yazılım projesi
  MISSION     : "mission",      // Sprint görevi
  TECHNOLOGY  : "technology",   // Dil, framework, araç
  DECISION    : "decision",     // Mimari veya teknik karar
  GOAL        : "goal",         // Hedef (uzun vadeli hayatta kalır)
  BUG         : "bug",          // Hata
  SOLUTION    : "solution",     // Çözüm
  ARCHITECTURE: "architecture", // Mimari tasarım
  RELEASE     : "release",      // Sürüm
  AGENT       : "agent",        // AI ajan
  CONCEPT     : "concept",      // Soyut fikir
  FILE        : "file",         // Kaynak dosya
  MODULE      : "module",       // Kod modülü
});

// ── Life Graph Kenar Türleri ──────────────────────────────────────────────────

const EDGE_TYPE = Object.freeze({
  DEPENDS_ON  : "depends_on",
  CREATED_BY  : "created_by",
  IMPROVES    : "improves",
  BLOCKS      : "blocks",
  BELONGS_TO  : "belongs_to",
  SUPERSEDES  : "supersedes",
  RELATED_TO  : "related_to",
  USES        : "uses",
  DECIDED_BY  : "decided_by",
  PART_OF     : "part_of",
  KNOWS       : "knows",         // kişi → teknoloji
  PREFERS     : "prefers",       // kullanıcı → tercih
  SOLVES      : "solves",        // çözüm → hata
  ACHIEVED    : "achieved",      // kullanıcı → hedef
});

// ── Bağlam Türleri ────────────────────────────────────────────────────────────

const CONTEXT_TYPE = Object.freeze({
  CONTINUE         : "continue",          // önceki konuşmaya devam
  NEW_PROJECT      : "new_project",       // yeni proje
  NEW_MISSION      : "new_mission",       // yeni görev
  REFERENCE_RESOLVE: "reference_resolve", // zamir/referans çözümü
  GOAL_SET         : "goal_set",          // yeni hedef belirleme
  REFLECTION       : "reflection",        // öz değerlendirme
  CLARIFICATION    : "clarification",     // açıklama isteme
});

// ── Yansıma Türleri ───────────────────────────────────────────────────────────

const REFLECTION_TRIGGER = Object.freeze({
  SESSION_END  : "session_end",
  MISSION_DONE : "mission_done",
  BUG_SOLVED   : "bug_solved",
  DECISION_MADE: "decision_made",
  GOAL_ACHIEVED: "goal_achieved",
  MANUAL       : "manual",
});

// ── Referans Sinyalleri ───────────────────────────────────────────────────────

const REFERENCE_SIGNALS = new Set([
  // Türkçe
  "devam", "devam et", "devam edelim", "tamam", "bunu", "bunu yap",
  "onu", "onu yap", "orası", "orada", "bu", "şu", "aynı", "aynısı",
  "tekrar", "yine", "önceki gibi", "daha iyi", "düzelt", "güncelle",
  "evet", "hayır", "anlıyorum", "peki", "olur", "sonra",
  // English
  "continue", "same", "it", "this", "that", "there", "here",
  "again", "like before", "as before", "better", "fix", "update",
  "yes", "no", "ok", "okay", "go on", "proceed", "next",
]);

// ── Fabrika Fonksiyonları ────────────────────────────────────────────────────

function createNode({
  id    = null,
  type,
  label,
  data  = {},
  layer = null,
  confidence = 1.0,   // 0-1: ne kadar emin
  source = "inferred",  // "explicit" | "inferred" | "observed"
} = {}) {
  if (!type)  throw new Error("Node: type zorunlu");
  if (!label) throw new Error("Node: label zorunlu");
  return {
    id        : id || `${type}:${label.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}:${Date.now().toString(36)}`,
    type,
    label     : String(label).trim(),
    data      : { ...data },
    layer,
    confidence: Math.min(1, Math.max(0, Number(confidence) || 1)),
    source,
    createdAt : Date.now(),
    updatedAt : Date.now(),
    accessCount: 0,
  };
}

function createEdge({
  from,
  to,
  type,
  weight     = 1.0,
  data       = {},
  confidence = 1.0,
} = {}) {
  if (!from) throw new Error("Edge: from zorunlu");
  if (!to)   throw new Error("Edge: to zorunlu");
  if (!type) throw new Error("Edge: type zorunlu");
  return {
    id        : `${from}->${type}->${to}`,
    from,
    to,
    type,
    weight    : Math.min(10, Math.max(0, Number(weight) || 1)),
    data      : { ...data },
    confidence: Math.min(1, Math.max(0, Number(confidence) || 1)),
    createdAt : Date.now(),
    updatedAt : Date.now(),
  };
}

module.exports = {
  COGNITIVE_LAYER,
  NODE_TYPE,
  EDGE_TYPE,
  CONTEXT_TYPE,
  REFLECTION_TRIGGER,
  REFERENCE_SIGNALS,
  createNode,
  createEdge,
};
