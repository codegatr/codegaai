"use strict";

function orchestrateTask(task, plan) {
  const agents = [...new Set((plan.steps || []).map((step) => step.agent))];
  const queue = (plan.steps || []).map((step, index) => ({
    order: index + 1,
    status: "pending",
    ...step,
  }));

  return {
    taskId: task.id,
    agents,
    queue,
    nextAgent: queue[0]?.agent || "planner",
    status: "ready",
  };
}

module.exports = {
  orchestrateTask,
};
