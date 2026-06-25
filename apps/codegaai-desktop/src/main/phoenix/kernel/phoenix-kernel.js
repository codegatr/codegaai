"use strict";

const { routeIntent } = require("../router/intent-router");
const { selectAgent } = require("../agents/agent-registry");
const { buildExecutionPlan } = require("../runtime/execution-engine");

function createPhoenixContext(input, options = {}) {
  const intent = routeIntent(input);
  const agent = selectAgent(intent, input);
  const execution = buildExecutionPlan({ intent, agent, options });
  return {
    input: String(input || ""),
    intent,
    agent,
    execution,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  createPhoenixContext,
};
