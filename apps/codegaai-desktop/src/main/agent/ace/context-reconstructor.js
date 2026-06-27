"use strict";
/**
 * Context Reconstructor — Bağlam Yeniden İnşa Edici
 *
 * Her LLM çağrısından ÖNCE çalışır.
 * 7 adımlık pipeline: kim → hangi proje → hangi misyon →
 * kararlar → yarım kalanlar → hedefler → bilgi → hazır.
 *
 * Sohbet geçmişi değil, ANLAM tabanlı bağlam.
 */
const { CONTEXT_TYPE } = require("./cognitive-types");

class ContextReconstructor {
  constructor({ userBrain, projectBrain, conversationMemory, goalMemory, engineeringBrain, lifeGraph, workingMemory }={}) {
    this._userBrain          = userBrain;
    this._projectBrain       = projectBrain;
    this._conversationMemory = conversationMemory;
    this._goalMemory         = goalMemory;
    this._engineeringBrain   = engineeringBrain;
    this._lifeGraph          = lifeGraph;
    this._workingMemory      = workingMemory;
  }

  /**
   * 7 adımlık bağlam inşası. Her LLM çağrısından önce çalıştır.
   * @param {object} opts
   * @param {string}  opts.userId
   * @param {string}  opts.projectLabel
   * @param {string}  opts.topic         — güncel konu / mesaj özeti
   * @param {number}  opts.maxTokens     — yaklaşık token limiti
   * @returns {{ context: string, layers: object, tokenEstimate: number }}
   */
  reconstruct({ userId="default", projectLabel=null, topic="", maxTokens=2000 }={}) {
    const parts  = [];
    const layers = {};

    // ── L5: Kullanıcı kimdir? ─────────────────────────────────────────────────
    if (this._userBrain) {
      const userCtx = this._userBrain.contextFor(userId);
      if (userCtx) {
        parts.push(userCtx);
        layers[CONTEXT_TYPE.USER] = true;
      }
    }

    // ── L4: Hangi proje? ──────────────────────────────────────────────────────
    const activeProject = projectLabel || this._workingMemory?.snapshot?.()?.activeProject;
    if (activeProject && this._projectBrain) {
      const projCtx = this._projectBrain.contextFor(activeProject);
      if (projCtx) {
        parts.push(projCtx);
        layers[CONTEXT_TYPE.PROJECT] = activeProject;
      }
    }

    // ── L3: Son konuşmalar (semantik özet, RAW mesaj yok) ────────────────────
    if (this._conversationMemory && activeProject) {
      const convSummaries = this._conversationMemory.forProject(activeProject, 3);
      if (convSummaries.length) {
        const lines = ["# Son Konuşma Özetleri"];
        for (const s of convSummaries) lines.push(`- ${s.summary || s}`);
        parts.push(lines.join("\n"));
        layers[CONTEXT_TYPE.CONVERSATION] = true;
      }
    }

    // ── WorkingMemory: Aktif görev ve karar zinciri ───────────────────────────
    if (this._workingMemory) {
      const wm  = this._workingMemory.snapshot();
      const lines = [];
      if (wm.activeMission) lines.push(`**Aktif Misyon:** ${wm.activeMission}`);
      if (wm.currentTask)   lines.push(`**Mevcut Görev:** ${wm.currentTask}`);
      if (wm.recentDecisions?.length) {
        lines.push(`**Son Kararlar:**\n${wm.recentDecisions.slice(-3).map(d=>`- ${d.decision}`).join("\n")}`);
      }
      if (wm.openQuestions?.length) {
        lines.push(`**Açık Sorular:**\n${wm.openQuestions.slice(0,3).map(q=>`- ${q.question}`).join("\n")}`);
      }
      if (lines.length) {
        parts.push(`# Çalışma Durumu\n${lines.join("\n")}`);
        layers[CONTEXT_TYPE.WORKING] = true;
      }
    }

    // ── Hedefler ──────────────────────────────────────────────────────────────
    if (this._goalMemory) {
      const goalCtx = this._goalMemory.contextFor(userId);
      if (goalCtx) {
        parts.push(goalCtx);
        layers[CONTEXT_TYPE.GOAL] = true;
      }
    }

    // ── L6: Mühendislik bilgisi (konuya ilgili) ───────────────────────────────
    if (this._engineeringBrain && topic) {
      const engCtx = this._engineeringBrain.contextFor(topic);
      if (engCtx) {
        parts.push(engCtx);
        layers[CONTEXT_TYPE.ENGINEERING] = true;
      }
    }

    // ── Life Graph: Bağlantılı kavramlar ─────────────────────────────────────
    if (this._lifeGraph && activeProject) {
      try {
        const graphCtx = this._lifeGraph.traverse(activeProject);
        if (graphCtx?.relatedNodes?.length) {
          const related = graphCtx.relatedNodes.slice(0, 5).map(n => n.label || n.id).join(", ");
          parts.push(`# İlgili Kavramlar\n${related}`);
          layers[CONTEXT_TYPE.GRAPH] = true;
        }
      } catch (_) {}
    }

    const context      = parts.join("\n\n");
    const tokenEstimate = Math.ceil(context.length / 4);

    // Token limit aşılırsa, az önemli bölümleri kırp
    if (tokenEstimate > maxTokens) {
      const trimmed = context.slice(0, maxTokens * 4);
      return { context: trimmed, layers, tokenEstimate: maxTokens, trimmed: true };
    }

    return { context, layers, tokenEstimate, trimmed: false };
  }

  /**
   * Hızlı özet: sadece aktif proje + görev (1 satır sistem mesajı için)
   */
  quickContext(userId="default") {
    const wm      = this._workingMemory?.snapshot?.() || {};
    const project = wm.activeProject || "?";
    const task    = wm.currentTask   || wm.activeMission || "?";
    return `Proje: ${project} | Görev: ${task}`;
  }
}
module.exports = { ContextReconstructor };
