"use strict";

async function runSequential(plan, handlers = {}, progressBus = null) {
  const results = [];
  for (const subtask of plan.subtasks || []) {
    progressBus?.started?.(subtask.id, subtask.title);
    try {
      const handler = handlers[subtask.agent] || handlers.default;
      const result = typeof handler === "function"
        ? await handler(subtask, plan)
        : { ok: true, message: `${subtask.title} planlandı.` };
      progressBus?.completed?.(subtask.id, subtask.title);
      results.push({ ...subtask, status: "completed", result });
    } catch (error) {
      progressBus?.failed?.(subtask.id, subtask.title, error.message || String(error));
      results.push({ ...subtask, status: "failed", error: error.message || String(error) });
      break;
    }
  }
  return {
    ok: results.every((item) => item.status === "completed"),
    results,
  };
}

module.exports = {
  runSequential,
};
