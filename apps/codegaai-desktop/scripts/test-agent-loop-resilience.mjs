import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runReact, toolCallSignature } = require("../src/main/agent/agent-loop");

assert.equal(
  toolCallSignature({ name: "calculate", args: ["2+2"] }),
  toolCallSignature({ name: "calculate", args: ["2+2"] }),
  "identical tool calls need stable signatures",
);

let turns = 0;
const repeatedTool = async (messages) => {
  turns += 1;
  const joined = messages.map((message) => message.content).join("\n");
  if (joined.includes("ARAÇ KULLANMA")) return "";
  return '<tool>calculate("2+2")</tool>';
};
const repeatedResult = await runReact(
  [{ role: "user", content: "4'u doğrula" }],
  repeatedTool,
  { maxIters: 2 },
);
assert.equal(repeatedResult.toolCalls.length, 1, "the same tool call must execute only once");
assert.match(repeatedResult.content, /4/, "a blank final synthesis must preserve useful tool evidence");
assert.equal(turns, 3);

let recoverySeen = false;
const failingThenRecovering = async (messages) => {
  const joined = messages.map((message) => message.content).join("\n");
  if (joined.includes("Ajan Kurtarma Rehberi")) {
    recoverySeen = true;
    return "Araç başarısız oldu; elimde doğrulanmış sonuç yok.";
  }
  return '<tool>calculate("not valid")</tool>';
};
const recovered = await runReact(
  [{ role: "user", content: "hesapla" }],
  failingThenRecovering,
  { maxIters: 2 },
);
assert.equal(recoverySeen, true, "tool errors must be returned to the model as recovery guidance");
assert.match(recovered.content, /doğrulanmış sonuç yok/i);

console.log("Agent loop resilience OK");
