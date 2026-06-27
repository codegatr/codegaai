"use strict";

/**
 * context-engine.js — CODEGA AI Conversation Context Engine
 *
 * Sprint 10: MissionOS (ek modül)
 *
 * "Sanki yıllardır birlikte çalışan kıdemli bir yazılım mühendisiyle
 *  konuşuyormuş gibi hissettiren bir AI."
 *
 * Bu hissi veren şey model değil; bağlam yöneticisidir.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BEŞ KATMANLI BAĞLAM MİMARİSİ
 * ─────────────────────────────────────────────────────────────────────
 *  Layer 1: Immediate Context   — son 5-10 mesaj (anlık sohbet)
 *  Layer 2: Conversation Summary— sohbet özeti (sıkıştırılmış geçmiş)
 *  Layer 3: Project Brain       — hangi projede çalışılıyor
 *  Layer 4: Mission Memory      — hangi mission aktif
 *  Layer 5: Long-Term Memory    — kalıcı faktlar ve kurallar
 * ─────────────────────────────────────────────────────────────────────
 *
 * ContextResolver:
 *  - Zamirleri çözer: "bunu yap" → "user-service.js'yi düzenle"
 *  - Referansları çözer: "orası" → "Konya hava durumu"
 *  - Kısa mesajları genişletir: "devam" → "aktif mission'a devam et"
 *  - Bağlam tipi belirler: CONTINUE | NEW_TOPIC | MISSION_ACTION
 */

const { MISSION_STATES } = require("../mission/mission-types");

// ── Bağlam Tipleri ────────────────────────────────────────────────────────────

const CONTEXT_TYPE = Object.freeze({
  CONTINUE:       "continue",       // önceki konuyla devam
  NEW_TOPIC:      "new_topic",      // tamamen yeni konu
  MISSION_ACTION: "mission_action", // aktif mission üzerinde işlem
  PROJECT_ACTION: "project_action", // aktif proje üzerinde işlem
  CLARIFICATION:  "clarification",  // önceki mesajı açıklıyor
});

// ── Kısa Mesaj Sinyalleri ────────────────────────────────────────────────────

/** Bu mesajlar önceki bağlama referans verir, asla izole değildir. */
const CONTINUATION_SIGNALS = new Set([
  "devam", "devam et", "continue", "go on", "next",
  "tamam", "ok", "okay", "olur", "tamamdır", "anladım",
  "evet", "yes", "hayır", "no",
  "bunu", "bunu yap", "bunu düzelt", "bunu ekle",
  "şunu", "orası", "oraya", "oradan",
  "aynısını", "aynı şekilde",
  "daha iyisi", "daha iyi yap",
  "tekrar", "bir daha",
  "dur", "bekle", "iptal",
]);

/** Mission eylemleri: aktif mission varsa bunlar misyona yönlendirilir. */
const MISSION_ACTION_SIGNALS = new Set([
  "devam", "devam et", "continue", "next task",
  "onayla", "approve", "yayınla", "release",
  "iptal", "cancel", "durdur",
  "sonraki adım", "bir sonraki",
]);

// ── ContextWindow ─────────────────────────────────────────────────────────────

/**
 * Sliding window — son N mesajı tutar.
 */
class ContextWindow {
  constructor(size = 10) {
    this._size = size;
    this._messages = []; // { role, content, ts }
  }

  push(role, content) {
    this._messages.push({ role, content, ts: Date.now() });
    if (this._messages.length > this._size) {
      this._messages.shift();
    }
  }

  last(n = 3) {
    return this._messages.slice(-n);
  }

  all() {
    return [...this._messages];
  }

  lastUserMessage() {
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (this._messages[i].role === "user") return this._messages[i];
    }
    return null;
  }

  lastAssistantMessage() {
    for (let i = this._messages.length - 1; i >= 0; i--) {
      if (this._messages[i].role === "assistant") return this._messages[i];
    }
    return null;
  }

  clear() {
    this._messages = [];
  }

  size() {
    return this._messages.length;
  }
}

// ── ContextResolver ───────────────────────────────────────────────────────────

/**
 * Bağlam çözücü: belirsiz ifadeleri somut referanslara çevirir.
 */
class ContextResolver {
  /**
   * Gelen mesajın bağlam tipini belirler.
   *
   * @param {string} message
   * @param {ContextWindow} window
   * @param {object} state — { activeMission, activeProject }
   * @returns {{ type, resolved, confidence, reason }}
   */
  resolve(message, window, state = {}) {
    const msg  = String(message || "").trim().toLowerCase();
    const short = msg.length <= 30;

    // 1. Aktif mission varsa mission action kontrolü
    if (state.activeMission && MISSION_ACTION_SIGNALS.has(msg)) {
      return {
        type:       CONTEXT_TYPE.MISSION_ACTION,
        resolved:   this._resolveMissionAction(msg, state.activeMission),
        confidence: 0.95,
        reason:     `Aktif mission "${state.activeMission.title}" üzerinde eylem`,
      };
    }

    // 2. Açık continuation sinyali
    if (CONTINUATION_SIGNALS.has(msg)) {
      const last = window.lastUserMessage();
      return {
        type:       CONTEXT_TYPE.CONTINUE,
        resolved:   this._resolveContinuation(msg, last?.content, state),
        confidence: 0.90,
        reason:     `"${msg}" → önceki bağlamın devamı`,
      };
    }

    // 3. Kısa mesaj + önceki mesaj var → continuation
    if (short && window.size() > 0) {
      const enriched = this._enrichShortMessage(message, window, state);
      if (enriched !== message) {
        return {
          type:       CONTEXT_TYPE.CONTINUE,
          resolved:   enriched,
          confidence: 0.75,
          reason:     "Kısa mesaj önceki bağlamdan zenginleştirildi",
        };
      }
    }

    // 4. Önceki konuyla bağlantılı mı? (konu devamı)
    const topicContinuation = this._detectTopicContinuation(message, window);
    if (topicContinuation) {
      return {
        type:       CONTEXT_TYPE.CONTINUE,
        resolved:   message, // aynı mesaj, ama bağlam paketi eklenecek
        confidence: 0.70,
        reason:     topicContinuation,
      };
    }

    // 5. Aktif proje bağlamı
    if (state.activeProject) {
      const projectRef = this._detectProjectReference(message, state.activeProject);
      if (projectRef) {
        return {
          type:       CONTEXT_TYPE.PROJECT_ACTION,
          resolved:   message,
          confidence: 0.80,
          reason:     `Aktif proje "${state.activeProject.name}" bağlamında`,
        };
      }
    }

    // 6. Yeni konu
    return {
      type:       CONTEXT_TYPE.NEW_TOPIC,
      resolved:   message,
      confidence: 0.85,
      reason:     "Bağımsız yeni konu tespit edildi",
    };
  }

  _resolveMissionAction(msg, mission) {
    if (["devam", "devam et", "continue", "next task", "sonraki adım"].includes(msg)) {
      return `Mission "${mission.title}" üzerinde devam et — bir sonraki task'a geç`;
    }
    if (["onayla", "approve"].includes(msg)) {
      return `Mission "${mission.title}" için insan onayı ver — review'dan complete'e geç`;
    }
    if (["yayınla", "release"].includes(msg)) {
      return `Mission "${mission.title}" için release oluştur`;
    }
    if (["iptal", "cancel", "durdur"].includes(msg)) {
      return `Mission "${mission.title}" iptal et`;
    }
    return msg;
  }

  _resolveContinuation(msg, previousMsg, state) {
    if (!previousMsg) return msg;
    if (["devam", "devam et", "continue"].includes(msg)) {
      if (state.activeMission) return `"${state.activeMission.title}" mission'ına devam et`;
      return `Şunun devamını yap: ${previousMsg.slice(0, 80)}`;
    }
    if (["tamam", "olur", "evet", "ok", "okay"].includes(msg)) {
      return `Önceki öneriyi onayla: ${previousMsg.slice(0, 60)}`;
    }
    return msg;
  }

  _enrichShortMessage(msg, window, state) {
    const lastUser = window.lastUserMessage();
    const lastAsst = window.lastAssistantMessage();
    if (!lastUser && !lastAsst) return msg;

    // Zamir + önceki konu
    const pronounPatterns = [
      { re: /^(bunu|bunu yap|bunu düzelt|bunu ekle)\s*$/i, fn: (prev) => `${prev} — bunu uygula` },
      { re: /^(şunu|şunu yap)\s*$/i, fn: (prev) => `${prev} ile ilgili: ${msg}` },
      { re: /^(peki ya|peki)\s*(.+)/i, fn: (prev, m) => `${prev} bağlamında: ${m[2]}` },
    ];

    const prev = lastUser?.content || "";
    for (const { re, fn } of pronounPatterns) {
      const m = msg.match(re);
      if (m) return fn(prev, m);
    }

    return msg;
  }

  _detectTopicContinuation(msg, window) {
    if (window.size() < 2) return null;
    const recent = window.last(4).map(m => m.content.toLowerCase());
    // Önceki mesajda geçen anahtar kelimeler bu mesajda da var mı?
    const prevWords = new Set(recent.slice(0, -1).join(" ").split(/\W+/).filter(w => w.length > 4));
    const currWords = msg.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const overlap   = currWords.filter(w => prevWords.has(w));
    if (overlap.length >= 2) {
      return `Ortak kelimeler: ${overlap.slice(0, 3).join(", ")} — konu devamı`;
    }
    return null;
  }

  _detectProjectReference(msg, project) {
    const m = msg.toLowerCase();
    const projectKeywords = [
      project.name?.toLowerCase(),
      ...(project.stack ? [project.stack.toLowerCase()] : []),
    ].filter(Boolean);
    return projectKeywords.some(k => m.includes(k));
  }
}

// ── ContextEngine ─────────────────────────────────────────────────────────────

class ContextEngine {
  constructor() {
    this._window   = new ContextWindow(10);
    this._resolver = new ContextResolver();
    this._summary  = "";       // Layer 2: sohbet özeti
    this._activeMission  = null;  // Layer 4: aktif mission
    this._activeProject  = null;  // Layer 3: aktif proje
    this._recentFiles    = [];    // Layer 3: son dosyalar
    this._recentTools    = [];    // Layer 3: son araç kullanımları
  }

  // ── Durum Güncellemeleri ──────────────────────────────────────────────────

  /** Yeni mesaj ekle (sohbet akışına). */
  push(role, content) {
    this._window.push(role, content);
    this._maybeSummarize();
  }

  setActiveMission(mission) {
    this._activeMission = mission;
  }

  clearActiveMission() {
    this._activeMission = null;
  }

  setActiveProject(project) {
    this._activeProject = project;
  }

  addRecentFile(filePath) {
    this._recentFiles = [filePath, ...this._recentFiles.filter(f => f !== filePath)].slice(0, 10);
  }

  addRecentTool(toolName) {
    this._recentTools = [toolName, ...this._recentTools.filter(t => t !== toolName)].slice(0, 10);
  }

  // ── Ana Analiz ────────────────────────────────────────────────────────────

  /**
   * Yeni mesajı analiz et: bağlam tipini belirle ve zenginleştirilmiş
   * bağlam paketi döndür.
   *
   * @param {string} message — kullanıcı mesajı
   * @returns {object} ContextPacket
   */
  analyze(message) {
    const state = {
      activeMission:  this._activeMission,
      activeProject:  this._activeProject,
    };

    const resolution = this._resolver.resolve(message, this._window, state);

    return {
      // Çözünme sonucu
      type:           resolution.type,
      resolvedMessage: resolution.resolved,
      confidence:     resolution.confidence,
      reason:         resolution.reason,

      // Bağlam katmanları
      layers: {
        immediate:    this._window.last(5),           // Layer 1
        summary:      this._summary,                  // Layer 2
        project:      this._activeProject,            // Layer 3
        mission:      this._activeMission,            // Layer 4
        recentFiles:  this._recentFiles.slice(0, 5),  // Layer 3 ek
        recentTools:  this._recentTools.slice(0, 5),  // Layer 3 ek
      },

      // LLM'e gönderilecek sıkıştırılmış bağlam
      compressedContext: this._buildCompressedContext(resolution),

      // Meta
      isContinuation:  resolution.type !== CONTEXT_TYPE.NEW_TOPIC,
      isMissionAction: resolution.type === CONTEXT_TYPE.MISSION_ACTION,
      isProjectAction: resolution.type === CONTEXT_TYPE.PROJECT_ACTION,
    };
  }

  /**
   * Devam mı yoksa yeni konu mu? Hızlı kontrol.
   */
  isContinuation(message) {
    const result = this.analyze(message);
    return result.isContinuation;
  }

  // ── Bağlam Paketi ─────────────────────────────────────────────────────────

  _buildCompressedContext(resolution) {
    const parts = [];

    // Aktif mission
    if (this._activeMission) {
      const m = this._activeMission;
      const done = m.milestones.flatMap(ms => ms.tasks).filter(t => t.state === "completed").length;
      const total = m.milestones.flatMap(ms => ms.tasks).length;
      parts.push(`[AKTİF MİSYON: "${m.title}" — ${m.completionPercent || 0}% tamamlandı, ${done}/${total} görev]`);
    }

    // Aktif proje
    if (this._activeProject) {
      parts.push(`[AKTİF PROJE: "${this._activeProject.name}"]`);
    }

    // Sohbet özeti (eğer varsa)
    if (this._summary) {
      parts.push(`[SOHBET ÖZETİ: ${this._summary}]`);
    }

    // Son mesajlar (Layer 1)
    const recent = this._window.last(3);
    if (recent.length > 1) {
      // Mevcut mesajı hariç tut (zaten gönderilecek)
      const prev = recent.slice(0, -1);
      parts.push(`[SON MESAJLAR:\n${prev.map(m => `${m.role === "user" ? "Kullanıcı" : "CODEGA"}: ${m.content.slice(0, 150)}`).join("\n")}]`);
    }

    // Bağlam türü notu
    if (resolution.type === CONTEXT_TYPE.CONTINUE) {
      parts.push(`[BAĞLAM: Önceki konunun devamı — ${resolution.reason}]`);
    }

    return parts.join("\n");
  }

  // ── Özetle ───────────────────────────────────────────────────────────────

  _maybeSummarize() {
    // Pencere dolduğunda özet güncelle (basit: son user mesajından)
    if (this._window.size() >= 8) {
      const messages = this._window.all();
      const topics = messages
        .filter(m => m.role === "user" && m.content.length > 20)
        .map(m => m.content.slice(0, 60))
        .slice(-3);
      if (topics.length) {
        this._summary = `Son konular: ${topics.join(" | ")}`;
      }
    }
  }

  /** Sohbet geçmişini temizle (yeni konu başlangıcı). */
  reset() {
    this._window.clear();
    this._summary = "";
    // Mission ve proje bağlamı korunur
  }

  /** Tam durum snapshot (debug ve test için). */
  snapshot() {
    return {
      windowSize:    this._window.size(),
      summary:       this._summary,
      activeMission: this._activeMission?.id || null,
      activeProject: this._activeProject?.name || null,
      recentFiles:   this._recentFiles,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const contextEngine = new ContextEngine();

module.exports = {
  ContextEngine,
  ContextWindow,
  ContextResolver,
  CONTEXT_TYPE,
  CONTINUATION_SIGNALS,
  MISSION_ACTION_SIGNALS,
  contextEngine,
};
