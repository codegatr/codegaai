"use strict";

const { createTask } = require("./task-engine/create-task");
const { planTask } = require("./planner/plan-task");
const { orchestrateTask } = require("./orchestrator/orchestrate-task");

function runPhoenix(input, options = {}) {
  const task = createTask(input, options);
  const plan = planTask(task, options);
  const orchestration = orchestrateTask(task, plan, options);
  return {
    task,
    plan,
    orchestration,
    status: "planned",
  };
}

module.exports = {
  createTask,
  planTask,
  orchestrateTask,
  runPhoenix,
};
