"use strict";

async function executeChain({ chain = [], messages = [], runModel, onAttempt }) {
  if (typeof runModel !== "function") throw new Error("runModel function is required");
  const errors = [];
  for (const model of chain || []) {
    try {
      if (typeof onAttempt === "function") onAttempt(model);
      const answer = await runModel(model, messages);
      if (answer && String(answer).trim()) return { ok: true, model, answer: String(answer).trim(), errors };
      errors.push({ model, error: "empty_response" });
    } catch (error) {
      errors.push({ model, error: error && error.message ? error.message : String(error) });
    }
  }
  return { ok: false, model: "", answer: "", errors };
}

module.exports = {
  executeChain,
};
