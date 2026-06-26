"use strict";

const { createHeartbeatMonitor } = require("./heartbeat");

const WATCHDOG_STATUS = Object.freeze({
  HEALTHY: "healthy",
  STALE: "stale",
  EXPIRED: "expired",
});

class PhoenixWatchdog {
  constructor({ eventBus = null, heartbeat = null, staleMs = 90000, expireMs = 180000 } = {}) {
    this.eventBus = eventBus;
    this.heartbeat = heartbeat || createHeartbeatMonitor({ eventBus, staleMs });
    this.staleMs = staleMs;
    this.expireMs = expireMs;
  }

  beat(taskId, metadata = {}) {
    return this.heartbeat.beat(taskId, metadata);
  }

  inspect(taskId) {
    const age = this.heartbeat.age(taskId);
    const status = age > this.expireMs
      ? WATCHDOG_STATUS.EXPIRED
      : age > this.staleMs
        ? WATCHDOG_STATUS.STALE
        : WATCHDOG_STATUS.HEALTHY;
    const report = { taskId: String(taskId || ""), age, status, staleMs: this.staleMs, expireMs: this.expireMs };
    this.eventBus?.emit("watchdog.inspect", report);
    return report;
  }

  shouldAbort(taskId) {
    return this.inspect(taskId).status === WATCHDOG_STATUS.EXPIRED;
  }

  inspectAll() {
    return [...this.heartbeat.items.keys()].map((taskId) => this.inspect(taskId));
  }
}

function createPhoenixWatchdog(options) {
  return new PhoenixWatchdog(options);
}

module.exports = {
  WATCHDOG_STATUS,
  PhoenixWatchdog,
  createPhoenixWatchdog,
};
