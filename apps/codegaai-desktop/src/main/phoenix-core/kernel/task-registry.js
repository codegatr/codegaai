"use strict";

const crypto = require("node:crypto");

const TASK_STATUS = Object.freeze({
  CREATED: "created",
  RUNNING: "running",
  WAITING: "waiting",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

class PhoenixTaskRegistry {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.tasks = new Map();
  }

  create({ intent = "unknown", input = "", context = {}, metadata = {} } = {}) {
    const now = Date.now();
    const task = {
      id: crypto.randomUUID(),
      intent,
      input: String(input || ""),
      status: TASK_STATUS.CREATED,
      progress: 0,
      context: { ...context },
      metadata: { ...metadata },
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      heartbeatAt: now,
      error: null,
      result: null,
    };
    this.tasks.set(task.id, task);
    this.eventBus?.emit("task.created", { task });
    return task;
  }

  get(id) {
    return this.tasks.get(id) || null;
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  update(id, patch = {}) {
    const task = this.get(id);
    if (!task) return null;
    Object.assign(task, patch, { updatedAt: Date.now() });
    this.eventBus?.emit("task.updated", { task });
    return task;
  }

  start(id) {
    const now = Date.now();
    const task = this.update(id, {
      status: TASK_STATUS.RUNNING,
      startedAt: now,
      heartbeatAt: now,
    });
    if (task) this.eventBus?.emit("task.started", { task });
    return task;
  }

  heartbeat(id, data = {}) {
    const task = this.update(id, {
      heartbeatAt: Date.now(),
      progress: typeof data.progress === "number" ? Math.max(0, Math.min(100, data.progress)) : this.get(id)?.progress || 0,
      metadata: { ...(this.get(id)?.metadata || {}), ...(data.metadata || {}) },
    });
    if (task) this.eventBus?.emit("task.heartbeat", { task, data });
    return task;
  }

  complete(id, result = null) {
    const task = this.update(id, {
      status: TASK_STATUS.COMPLETED,
      progress: 100,
      completedAt: Date.now(),
      result,
    });
    if (task) this.eventBus?.emit("task.completed", { task });
    return task;
  }

  fail(id, error) {
    const task = this.update(id, {
      status: TASK_STATUS.FAILED,
      completedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error || "Unknown error"),
    });
    if (task) this.eventBus?.emit("task.failed", { task });
    return task;
  }

  cancel(id, reason = "cancelled") {
    const task = this.update(id, {
      status: TASK_STATUS.CANCELLED,
      completedAt: Date.now(),
      error: reason,
    });
    if (task) this.eventBus?.emit("task.cancelled", { task });
    return task;
  }
}

function createTaskRegistry(options) {
  return new PhoenixTaskRegistry(options);
}

module.exports = {
  TASK_STATUS,
  PhoenixTaskRegistry,
  createTaskRegistry,
};
