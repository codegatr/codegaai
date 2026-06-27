"use strict";
/**
 * Self Reflector — Öz Yansıma Motoru
 * Her konuşma sonunda çalışır.
 * 5 soru sorar, cevaplarını belleklere yazar.
 *
 * "Ne öğrendim? Anlayışım ne değişti?
 *  Ne eksik kaldı? Bir dahaki sefere ne yapmalıyım?
 *  Kullanıcı hakkında ne öğrendim?"
 */
const { REFLECTION_TRIGGER } = require("./cognitive-types");

const REFLECTION_QUESTIONS = [
  "Bu konuşmada ne öğrendim?",
  "Anlayışım veya beklentilerim ne değişti?",
  "Hangi görevler yarım kaldı veya çözülmedi?",
  "Bir dahaki sefere ne farklı yapmalıyım?",
  "Kullanıcı hakkında ne öğrendim?",
];

class SelfReflector {
  constructor({ conversationMemory, projectBrain, userBrain, engineeringBrain, workingMemory }={}) {
    this._conversationMemory = conversationMemory;
    this._projectBrain       = projectBrain;
    this._userBrain          = userBrain;
    this._engineeringBrain   = engineeringBrain;
    this._workingMemory      = workingMemory;
    this._reflections        = [];
  }

  /**
   * Konuşma sonunda kural tabanlı (LLM gerektirmeyen) öz-yansıma.
   * Gerçek LLM ile daha derin yansıma için generateFn sağlanabilir.
   * @param {object}   opts
   * @param {string}   opts.trigger     — REFLECTION_TRIGGER enum
   * @param {string}   opts.userId
   * @param {Function} [opts.generateFn] — opsiyonel LLM çağrısı
   * @returns {object} reflection
   */
  async reflect({ trigger=REFLECTION_TRIGGER.END_OF_CONVERSATION, userId="default", generateFn=null }={}) {
    const wm      = this._workingMemory?.snapshot?.() || {};
    const project = wm.activeProject;
    const mission = wm.activeMission;
    const topics  = this._conversationMemory ? this._conversationMemory._current?.topics || [] : [];
    const decisions = wm.recentDecisions || [];
    const open    = wm.openQuestions || [];

    const reflection = {
      id        : `REF-${Date.now().toString(36)}`,
      trigger,
      userId,
      project,
      mission,
      timestamp : Date.now(),
      learned   : [],
      changed   : [],
      unfinished: [],
      nextTime  : [],
      userInsights: [],
      rawSummary: null,
    };

    // Kural tabanlı: konuşmadan çıkar
    if (topics.length) {
      reflection.learned.push(`${topics.length} farklı konu ele alındı: ${topics.slice(0,3).join(", ")}`);
    }
    if (decisions.length) {
      reflection.changed.push(`${decisions.length} karar alındı: ${decisions.slice(-2).map(d=>d.decision).join("; ")}`);
    }
    if (open.length) {
      reflection.unfinished.push(...open.slice(0,3).map(q => q.question));
    }
    if (wm.turnCount > 10) {
      reflection.nextTime.push("Uzun konuşma — bir dahaki sefere daha erken görev odakla.");
    }

    // LLM tabanlı derin yansıma (opsiyonel)
    if (generateFn && topics.length) {
      try {
        const prompt = `Aşağıdaki konuşma özetine dayanarak 5 soruyu kısaca yanıtla:
${REFLECTION_QUESTIONS.map((q,i) => `${i+1}. ${q}`).join("\n")}

Konuşma konuları: ${topics.join(", ")}
Alınan kararlar: ${decisions.map(d=>d.decision).join(", ") || "yok"}
Açık sorular: ${open.map(q=>q.question).join(", ") || "yok"}

JSON formatında yanıtla: {learned:[],changed:[],unfinished:[],nextTime:[],userInsights:[]}`;

        const result = await generateFn([{ role: "user", content: prompt }]);
        try {
          const parsed = JSON.parse(result.replace(/```json|```/g,"").trim());
          if (parsed.learned)      reflection.learned.push(...(parsed.learned || []));
          if (parsed.changed)      reflection.changed.push(...(parsed.changed || []));
          if (parsed.unfinished)   reflection.unfinished.push(...(parsed.unfinished || []));
          if (parsed.nextTime)     reflection.nextTime.push(...(parsed.nextTime || []));
          if (parsed.userInsights) reflection.userInsights.push(...(parsed.userInsights || []));
        } catch (_) {
          reflection.rawSummary = String(result).slice(0, 500);
        }
      } catch (e) {
        console.warn("[SelfReflector] LLM reflection failed:", e.message);
      }
    }

    // Yansımayı belleklere yaz
    this._writeBack(reflection);
    this._reflections.push(reflection);
    return reflection;
  }

  _writeBack(r) {
    // ConversationMemory: commit
    if (this._conversationMemory && r.project) {
      const summary = [
        ...r.learned.slice(0,2),
        ...r.changed.slice(0,1),
      ].join("; ") || `${r.project} projesi üzerine konuşma`;
      this._conversationMemory.commit(summary);
    }

    // ProjectBrain: unfinished → openTodos, insights → architecture
    if (this._projectBrain && r.project) {
      const pb = this._projectBrain.getProject(r.project);
      if (pb) {
        for (const item of r.unfinished.slice(0,2)) {
          this._projectBrain.addOpenTodo?.(r.project, item);
        }
        for (const item of r.learned.slice(0,1)) {
          if (item.length > 20) this._projectBrain.addArchitecture?.(r.project, item);
        }
      }
    }

    // EngineeringBrain: decisions as knowledge
    if (this._engineeringBrain) {
      for (const item of r.changed.slice(0,1)) {
        if (item.length > 20) {
          try {
            this._engineeringBrain.learn({
              type : "arch_decision",
              title: item.slice(0, 80),
              description: item,
              tags : [r.project, r.mission].filter(Boolean),
              confidence: 0.6,
              source: "self-reflection",
            });
          } catch (_) {}
        }
      }
    }

    // UserBrain: user insights
    if (this._userBrain && r.userInsights?.length) {
      for (const insight of r.userInsights.slice(0,2)) {
        this._userBrain.addDecisionPattern?.(r.userId, insight);
      }
    }
  }

  last(n=5) { return this._reflections.slice(-n); }

  summary() {
    return {
      total        : this._reflections.length,
      lastReflection: this._reflections[this._reflections.length-1] || null,
    };
  }
}
module.exports = { SelfReflector, REFLECTION_QUESTIONS };
