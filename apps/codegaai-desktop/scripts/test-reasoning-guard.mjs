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
assert.ok(guard.shouldVerifyAnswer("Bu hata neden oluyor, analiz et"), "analysis/debug answers are verified by AVE");
assert.equal(guard.APPROVAL_THRESHOLD, 95, "AVE approval threshold is 95");
assert.ok(guard.shouldEnforceConclusion("Hangisini seçmeliyim?"), "substantive answers require MCE");
assert.equal(guard.shouldEnforceConclusion("merhaba"), false, "smalltalk does not require MCE");
assert.equal(guard.hasVisibleConclusion("Açıklama...\n\nFinal Answer: 42"), true, "visible final answer is detected");
assert.equal(guard.hasVisibleConclusion("Bu birkaç yolla ele alınabilir."), false, "non-conclusive answer is rejected by MCE detector");

const lowConfidence = guard.parseVerificationResult(
  JSON.stringify({
    ok: true,
    reasoningScore: 95,
    mathScore: 94,
    logicScore: 96,
    consistencyScore: 96,
    completenessScore: 97,
    answer: "x = 24",
  }),
  "draft"
);
assert.equal(lowConfidence.ok, false, "any confidence under 95 fails verification");

let calls = 0;
const fixedEquation = await guard.verifyReasoningAnswer(
  "2x + 4 = 52 ise x kac?",
  "2x = 48, x = 24. Final: 1 yil sonra.",
  async () => {
    calls += 1;
    return JSON.stringify({
      ok: calls > 1,
      reasoningScore: calls > 1 ? 98 : 92,
      mathScore: calls > 1 ? 99 : 89,
      logicScore: calls > 1 ? 98 : 90,
      consistencyScore: calls > 1 ? 97 : 80,
      completenessScore: calls > 1 ? 96 : 90,
      errors: calls > 1 ? [] : ["final answer contradicts derived value"],
      correctedReasoning: "2x + 4 = 52, so x = 24.",
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
    reasoningScore: 99,
    mathScore: 99,
    logicScore: 99,
    consistencyScore: 99,
    completenessScore: 99,
    errors: ["draft confuses every nth door with first n doors"],
    correctedReasoning: "A door is toggled once per divisor; only squares have odd divisor counts.",
    answer: "Open doors are the perfect squares: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100.",
  }),
  { passes: 1 }
);
assert.match(
  doors.answer,
  /1, 4, 9, 16, 25, 36, 49, 64, 81, 100/,
  "100 doors answer is corrected to perfect squares"
);

const concluded = await guard.enforceConclusion(
  "Hangisini seçmeliyim?",
  "A seçeneği daha düşük riskli çünkü kurulumu daha basit.",
  async () => JSON.stringify({
    ok: true,
    answer: "A seçeneği daha düşük riskli çünkü kurulumu daha basit.\n\nFinal Answer: A seçeneğini seç.",
    errors: [],
  })
);
assert.equal(concluded.enforced, true, "MCE rewrites answers without a final conclusion");
assert.match(concluded.answer, /Final Answer:/, "MCE output includes final answer section");

console.log("Reasoning guard tests passed");
