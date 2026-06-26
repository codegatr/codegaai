"use strict";

const { createEventBus } = require("./event-bus");
const { createTaskRegistry } = require("./task-registry");
const { classifyIntent } = require("../intent/intent-engine");

class PhoenixKernel {
  constructor({ eventBus = null, taskRegistry = null, handlers = {} } = {}) {
    this.eventBus = eventBus || createEventBus();
    this.tasks = taskRegistry || createTaskRegistry({ eventBus: this.eventBus });
    this.handlers = new Map(Object.entries(handlers));
  }

  register(route, handler) {
    if (!route || typeof handler !== "function") throw new Error("PhoenixKernel.register requires route and handler");
    this.handlers.set(route, handler);
    this.eventBus.emit("kernel.handler.registered", { route });
    return () => this.handlers.delete(route);
  }

  async dispatch(input, context = {}) {
    const classification = classifyIntent(input);
    const task = this.tasks.create({
      intent: classification.intent,
      input,
      context,
      metadata: { classification },
    });

    this.tasks.start(task.id);
    this.eventBus.emit("intent.resolved", { taskId: task.id, classification });

    try {
      if (classification.route === "fast_path") {
        const result = {
          text: classification.fastAnswer,
          route: "fast_path",
          intent: classification.intent,
        };
        this.tasks.complete(task.id, result);
        return { task: this.tasks.get(task.id), result };
      }

      const handler = this.handlers.get(classification.route) || this.handlers.get("default");
      if (!handler) {
        const result = {
          text: "Phoenix Core v2 bu görev için henüz bağlı bir ajan bulamadı.",
          route: classification.route,
          intent: classification.intent,
          needsModel: classification.needsModel,
        };
        this.tasks.complete(task.id, result);
        return { task: this.tasks.get(task.id), result };
      }

      const result = await handler({ input, context, task: this.tasks.get(task.id), classification, kernel: this });
      this.tasks.complete(task.id, result);
      return { task: this.tasks.get(task.id), result };
    } catch (error) {
      this.tasks.fail(task.id, error);
      throw error;
    }
  }

  snapshot() {
    return {
      tasks: this.tasks.list(),
      events: this.eventBus.snapshot(),
      handlers: [...this.handlers.keys()],
    };
  }
}

function createPhoenixKernel(options) {
  return new PhoenixKernel(options);
}

module.exports = {
  PhoenixKernel,
  createPhoenixKernel,
};
