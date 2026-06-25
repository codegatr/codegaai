"use strict";

const CHAINS = {
  chat: ["qwen3.5:0.8b", "qwen2.5:1.5b", "qwen3.5:2b"],
  short_fact: ["qwen3.5:0.8b", "qwen2.5:1.5b", "qwen3.5:2b", "qwen2.5:3b"],
  code: ["qwen2.5-coder:3b", "qwen2.5-coder:3b-instruct", "qwen2.5-coder:7b", "qwen3.5:4b"],
  analysis: ["qwen3.5:4b", "qwen3.5:9b", "qwen3:8b"],
  balanced: ["qwen3.5:2b", "qwen2.5:3b", "qwen3.5:4b"],
};

function buildChain(intent = "balanced", preferred = "", extras = []) {
  const base = CHAINS[intent] || CHAINS.balanced;
  const seen = new Set();
  const out = [];
  for (const item of [...base, preferred, ...(extras || [])]) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.slice(0, 6);
}

module.exports = { CHAINS, buildChain };
