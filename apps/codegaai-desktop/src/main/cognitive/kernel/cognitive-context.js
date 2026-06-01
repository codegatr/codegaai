"use strict";

class CognitiveContext {
  constructor(input, opts = {}) {
    this.input = String(input || "");
    this.settings = opts.settings || {};
    this.flags = opts.flags || {};
    this.taskReport = opts.taskReport || null;
    this.taskRegistry = opts.taskRegistry || null;
    this.messages = [];
    this.stages = [];
    this.blocked = false;
    this.blockReason = "";
    this.blockErrors = [];
    this.answer = "";
  }

  addMessage(message) {
    if (message && message.role && message.content) this.messages.push(message);
    return this;
  }

  record(stage) {
    const entry = {
      name: stage.name,
      status: stage.status || (stage.ok === false ? "failed" : "passed"),
      ok: stage.ok !== false,
      confidence: Number.isFinite(stage.confidence) ? stage.confidence : null,
      errors: Array.isArray(stage.errors) ? stage.errors : [],
      detail: stage.detail || null,
    };
    this.stages.push(entry);
    if (entry.ok === false && stage.blocking) {
      this.block(stage.name, entry.errors);
    }
    return entry;
  }

  block(stageName, errors = []) {
    this.blocked = true;
    this.blockReason = stageName || "cognitive_gate";
    this.blockErrors = Array.isArray(errors) ? errors.filter(Boolean) : [String(errors || "verification failed")];
  }

  stageSummary() {
    return this.stages.map((stage) => ({
      name: stage.name,
      status: stage.status,
      ok: stage.ok,
      confidence: stage.confidence,
      errors: stage.errors,
    }));
  }
}

module.exports = {
  CognitiveContext,
};
