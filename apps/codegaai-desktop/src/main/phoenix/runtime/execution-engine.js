"use strict";

const MODEL_CHAINS = {
  chat: ["qwen3.5:0.8b", "qwen2.5:1.5b", "qwen3.5:2b"],
  short_fact: ["qwen3.5:0.8b", "qwen3.5:2b", "qwen2.5:3b"],
  code: ["qwen2.5-coder:3b", "qwen2.5-coder:7b", "qwen3.5:4b"],
  analysis: ["qwen3.5:4b", "qwen3.5:9b", "qwen3:8b"],
  research: ["qwen3.5:4b", "qwen3.5:9b"],
  design: ["qwen3.5:4b", "gemma3:4b"],
};

function buildExecutionPlan({ intent, agent, options = {} }) {
  const type = intent && intent.type ? intent.type : "chat";
  const preferred = options.preferredModel || "";
  const base = MODEL_CHAINS[type] || MODEL_CHAINS.chat;
  const chain = [];
  for (const model of [preferred, ...base]) {
    if (!model || chain.includes(model)) continue;
    chain.push(model);
  }
  return {
    intent: type,
    agentId: agent && agent.id ? agent.id : "chat-agent",
    modelChain: chain,
    timeoutMs: type === "code" ? 45000 : 30000,
    stream: true,
    requireOutputFirewall: true,
  };
}

module.exports = {
  MODEL_CHAINS,
  buildExecutionPlan,
};
