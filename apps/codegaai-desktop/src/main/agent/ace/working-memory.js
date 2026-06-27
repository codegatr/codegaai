"use strict";
/**
 * Layer 2: Working Memory — Aktif oturum hafızası
 * Lifetime: mevcut oturum (pencere kapatılana kadar)
 * Aktif görev, mevcut mission, araçlar, dosyalar, son kararlar.
 * Ham mesaj değil — anlık anlayış durumu.
 */
class WorkingMemory {
  constructor() {
    this.reset();
  }

  reset() {
    this._state = {
      sessionId      : Date.now().toString(36),
      activeProject  : null,
      activeMission  : null,
      currentTask    : null,
      reasoningChain : [],
      openQuestions  : [],
      activeFiles    : [],
      activeTools    : [],
      recentDecisions: [],
      turnCount      : 0,
      startedAt      : Date.now(),
    };
  }

  setProject(label)  { this._state.activeProject = String(label || ""); }
  setMission(label)  { this._state.activeMission = String(label || ""); }
  setTask(task)      { this._state.currentTask   = String(task   || ""); }

  addReasoning(step) {
    this._state.reasoningChain.push(String(step));
    if (this._state.reasoningChain.length > 20) this._state.reasoningChain.shift();
  }

  addQuestion(question) {
    this._state.openQuestions.push({ question: String(question), at: Date.now() });
    if (this._state.openQuestions.length > 10) this._state.openQuestions.shift();
  }

  resolveQuestion(question, answer="") {
    this._state.openQuestions = this._state.openQuestions.filter(q => q.question !== question);
  }

  addFile(f)  { if (!this._state.activeFiles.includes(f))  this._state.activeFiles.push(f); }
  addTool(t)  { if (!this._state.activeTools.includes(t))  this._state.activeTools.push(t); }

  addDecision(decision, rationale="") {
    this._state.recentDecisions.push({ decision: String(decision), rationale: String(rationale), at: Date.now() });
    if (this._state.recentDecisions.length > 10) this._state.recentDecisions.shift();
  }

  incrementTurn() { this._state.turnCount++; }

  project() { return this._state.activeProject; }
  mission() { return this._state.activeMission; }
  task()    { return this._state.currentTask; }

  snapshot() {
    const s = this._state;
    return {
      sessionId      : s.sessionId,
      activeProject  : s.activeProject,
      activeMission  : s.activeMission,
      currentTask    : s.currentTask,
      turnCount      : s.turnCount,
      reasoningChain : [...s.reasoningChain],
      openQuestions  : s.openQuestions.map(q => ({ question: q.question })),
      recentDecisions: s.recentDecisions.slice(-5).map(d => ({ decision: d.decision, rationale: d.rationale })),
      activeFiles    : s.activeFiles.slice(-10),
      activeTools    : [...s.activeTools],
    };
  }
}
module.exports = { WorkingMemory };
