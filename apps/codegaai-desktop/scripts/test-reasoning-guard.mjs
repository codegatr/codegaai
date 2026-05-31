import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const mainDir = path.join(root, "src", "main");
const mod = await import(pathToFileURL(path.join(mainDir, "agent", "reasoning-guard.js")).href);
const guard = mod.default || mod;

assert.ok(
  guard.classifyReasoningProblem("2x + 4 = 52 ise x kac?").includes("math"),
  "equations are classified as math"
);
assert.ok(
  guard.classifyReasoningProblem("100 doors problem every nth door").includes("logic"),
  "100 doors is classified as logic"
);

const lowConfidence = guard.parseVerificationResult(
  JSON.stringify({
    ok: true,
    reasoningConfidence: 95,
    mathVerificationConfidence: 88,
    consistencyConfidence: 96,
    answer: "x = 24",
  }),
  "draft"
);
assert.equal(lowConfidence.ok, false, "any confidence under 90 fails verification");

let calls = 0;
const fixedEquation = await guard.verifyReasoningAnswer(
  "2x + 4 = 52 ise x kac?",
  "2x = 48, x = 24. Final: 1 yil sonra.",
  async () => {
    calls += 1;
    return JSON.stringify({
      ok: calls > 1,
      reasoningConfidence: calls > 1 ? 98 : 92,
      mathVerificationConfidence: calls > 1 ? 99 : 89,
      consistencyConfidence: calls > 1 ? 97 : 80,
      answer: "x = 24.",
    });
  },
  { passes: 2 }
);
assert.equal(fixedEquation.answer, "x = 24.", "contradictory final answer is corrected");
assert.equal(calls, 2, "low confidence triggers another verification pass");

const doors = await guard.verifyReasoningAnswer(
  "100 doors problem: every nth pass toggles every nth door. Which remain open?",
  "First 50 doors remain open.",
  async () => JSON.stringify({
    ok: false,
    reasoningConfidence: 99,
    mathVerificationConfidence: 99,
    consistencyConfidence: 99,
    answer: "Open doors are the perfect squares: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100.",
  }),
  { passes: 1 }
);
assert.match(
  doors.answer,
  /1, 4, 9, 16, 25, 36, 49, 64, 81, 100/,
  "100 doors answer is corrected to perfect squares"
);

console.log("Reasoning guard tests passed");
