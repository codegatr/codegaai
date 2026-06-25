"use strict";

const { analyzePrompt } = require("./router/prompt-router");
const { buildChain } = require("./router/fallback");
const { executeChain } = require("./runtime/executor");

function planExecution(input, preferredModel = "", extraModels = []) {
  const route = analyzePrompt(input);
  const chain = buildChain(route.intent, preferredModel, extraModels);
  return { route, chain };
}

async function runPlanned(input, messages, opts = {}) {
  const plan = planExecution(input, opts.preferredModel || "", opts.extraModels || []);
  const result = await executeChain({
    chain: plan.chain,
    messages,
    runModel: opts.runModel,
    onAttempt: opts.onAttempt,
  });
  return { ...result, plan };
}

module.exports = {
  planExecution,
  runPlanned,
};
