"use strict";

class HeartbeatMonitor {
  constructor({ eventBus = null, staleMs = 90000 } = {}) {
    this.eventBus = eventBus;
    this.staleMs = staleMs;
    this.items = new Map();
  }

  beat(taskId, metadata = {}) {
    const id = String(taskId || "").trim();
    if (!id) throw new Error("HeartbeatMonitor requires taskId");
    const heartbeat = {
      taskId: id,
      at: Date.now(),
      metadata: { ...metadata },
    };
    this.items.set(id, heartbeat);
    this.eventBus?.emit("heartbeat", heartbeat);
    return heartbeat;
  }

  get(taskId) {
    return this.items.get(String(taskId || "")) || null;
  }

  age(taskId) {
    const heartbeat = this.get(taskId);
    return heartbeat ? Date.now() - heartbeat.at : Infinity;
  }

  isStale(taskId, staleMs = this.staleMs) {
    return this.age(taskId) > staleMs;
  }

  staleTasks(staleMs = this.staleMs) {
    return [...this.items.values()].filter((heartbeat) => Date.now() - heartbeat.at > staleMs);
  }

  remove(taskId) {
    this.items.delete(String(taskId || ""));
  }
}

function createHeartbeatMonitor(options) {
  return new HeartbeatMonitor(options);
}

module.exports = {
  HeartbeatMonitor,
  createHeartbeatMonitor,
};
