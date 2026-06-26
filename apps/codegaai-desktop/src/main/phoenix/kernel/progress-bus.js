"use strict";

function createProgressBus() {
  const listeners = new Set();
  const history = [];

  function emit(event) {
    const item = {
      id: `evt-${Date.now().toString(36)}-${history.length + 1}`,
      at: new Date().toISOString(),
      ...event,
    };
    history.push(item);
    if (history.length > 200) history.shift();
    for (const listener of listeners) {
      try { listener(item); } catch (_error) {}
    }
    return item;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function snapshot() {
    return history.slice();
  }

  return {
    emit,
    subscribe,
    snapshot,
    started: (taskId, label) => emit({ type: "started", taskId, label, progress: 0 }),
    progress: (taskId, label, progress) => emit({ type: "progress", taskId, label, progress }),
    completed: (taskId, label) => emit({ type: "completed", taskId, label, progress: 100 }),
    failed: (taskId, label, error) => emit({ type: "failed", taskId, label, error: String(error || "") }),
  };
}

module.exports = {
  createProgressBus,
};
