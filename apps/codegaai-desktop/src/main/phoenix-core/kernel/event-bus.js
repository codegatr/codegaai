"use strict";

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");

class PhoenixEventBus {
  constructor({ maxListeners = 200 } = {}) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(maxListeners);
    this.history = [];
    this.maxHistory = 500;
  }

  emit(type, payload = {}) {
    const event = {
      id: crypto.randomUUID(),
      type: String(type || "event.unknown"),
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      payload,
    };
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.emitter.emit(event.type, event);
    this.emitter.emit("*", event);
    return event;
  }

  on(type, listener) {
    this.emitter.on(type, listener);
    return () => this.off(type, listener);
  }

  once(type, listener) {
    this.emitter.once(type, listener);
    return () => this.off(type, listener);
  }

  off(type, listener) {
    this.emitter.off(type, listener);
  }

  snapshot() {
    return this.history.slice();
  }

  clear() {
    this.history = [];
  }
}

function createEventBus(options) {
  return new PhoenixEventBus(options);
}

module.exports = {
  PhoenixEventBus,
  createEventBus,
};
