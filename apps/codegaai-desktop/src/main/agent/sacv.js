"use strict";
/**
 * Semantic Answer Completeness Validator (SACV)
 * --------------------------------------------
 * Validates task completion by meaning, not by exact labels. A task can be
 * complete without repeating "Test 1", "Soru 1", or the original question text.
 */

const { finalAnswerText, trFold } = require("./final-answer-sanitizer");
const { solveDeterministic } = require("./mlvc");

function compact(text) {
  return trFold(text).replace(/\s+/g, " ").trim();
}

function splitAnswerUnits(text) {
  const final = String(text || "").trim();
  if (!final) return [];
  return final
    .split(/\s*(?:\||\n+|;)\s*/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function extractResultTokens(text) {
  const raw = String(text || "");
  const tokens = new Set();
  const add = (value) => {
    const clean = compact(value);
    if (clean) tokens.add(clean);
  };
  for (const fraction of raw.match(/\b-?\d+\s*\/\s*-?\d+\b/g) || []) add(fraction.replace(/\s+/g, ""));
  for (const percent of raw.match(/% ?-?\d+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)? ?%/g) || []) add(percent);
  for (const money of raw.match(/\b-?\d+(?:[.,]\d+)?\s*tl\b/gi) || []) add(money);
  for (const duration of raw.match(/\b\d+\s+saat\s+\d+\s+dakika\b/gi) || []) add(duration);
  for (const ordinal of raw.match(/\b\d+\.?\s*(?:gun|gün|sirada|sirada|sira|sıra)\b/gi) || []) add(ordinal);
  for (const number of raw.match(/\b-?\d+(?:[.,]\d+)?\b/g) || []) add(number.replace(",", "."));
  return [...tokens].filter((token) => token.length > 0);
}

function deterministicExpectedTokens(task) {
  const solved = solveDeterministic(task.body || "");
  if (!solved) return [];
  const final = finalAnswerText(solved) || solved;
  return extractResultTokens(final);
}

function tokenPresent(answer, token) {
  const haystack = compact(answer).replace(/,/g, ".");
  const needle = compact(token).replace(/,/g, ".");
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  if (/^-?\d+(?:\.\d+)?$/.test(needle)) {
    const n = Number(needle);
    const nums = haystack.match(/-?\d+(?:\.\d+)?/g) || [];
    return nums.some((value) => Math.abs(Number(value) - n) < 0.0001);
  }
  return false;
}

function hasReasoningTrace(answer) {
  const a = compact(answer);
  return /(islem|işlem|reasoning|calculation|hesap|cunku|çünkü|because|=>|=|\bx\s*=)/.test(a);
}

function hasVerificationTrace(answer) {
  const a = compact(answer);
  return /(dogrulama|doğrulama|verify|verification|kontrol|pass|saglama|sağlama)/.test(a);
}

function taskCompleteByMeaning(answer, finalText, task, units, index) {
  const expectedTokens = deterministicExpectedTokens(task);
  if (expectedTokens.length) {
    const present = expectedTokens.some((token) => tokenPresent(finalText, token) || tokenPresent(answer, token));
    return {
      ok: present,
      method: "deterministic-result",
      expectedTokens,
      errors: present ? [] : [`${task.label} result is missing semantically.`],
    };
  }

  const unit = units[index] || "";
  const hasOwnResult = extractResultTokens(unit).length > 0 || /\b(ev[et]|hayir|yes|no|olabilir|mümkün|mumkun|seç|sec|oner|öner)\b/i.test(unit);
  const enoughUnits = units.length >= index + 1;
  return {
    ok: hasOwnResult || enoughUnits,
    method: "answer-unit",
    expectedTokens: [],
    errors: hasOwnResult || enoughUnits ? [] : [`${task.label} does not have a distinguishable answer.`],
  };
}

function validateSemanticCompleteness(answer, taskReport) {
  if (!taskReport || !taskReport.applicable) {
    return { ok: true, expected: 0, completed: [], missing: [], errors: [], confidence: 100 };
  }

  const finalText = finalAnswerText(answer) || "";
  const units = splitAnswerUnits(finalText);
  const completed = [];
  const missing = [];
  const errors = [];

  if (!hasReasoningTrace(answer)) errors.push("Reasoning trace is missing.");
  if (!hasVerificationTrace(answer)) errors.push("Verification trace is missing.");

  for (let i = 0; i < taskReport.tasks.length; i += 1) {
    const task = taskReport.tasks[i];
    const result = taskCompleteByMeaning(answer, finalText, task, units, i);
    if (result.ok) completed.push({ task, method: result.method });
    else {
      missing.push(task);
      errors.push(...result.errors);
    }
  }

  const ok = errors.length === 0 && missing.length === 0;
  return {
    ok,
    expected: taskReport.count,
    completed,
    missing,
    errors,
    confidence: ok ? 100 : Math.max(0, Math.round((completed.length / taskReport.count) * 100)),
  };
}

function buildSemanticRepairMessages(question, answer, taskReport, validation) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Semantic Answer Completeness Validator repair gate.",
        "Rewrite the answer so every detected task is semantically completed.",
        "Do not validate or write by exact label matching. Do not repeat the original question text.",
        "For each task, provide reasoning, verification, and one final result.",
        "Final Answer must contain completed answers only; task labels are optional, question text is forbidden.",
        "Return the corrected full answer only.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Detected task count: ${taskReport ? taskReport.count : 0}`,
        `Semantic completeness errors:\n${(validation.errors || []).join("\n")}`,
        `Original request:\n${question}`,
        `Previous answer:\n${answer}`,
      ].join("\n\n"),
    },
  ];
}

module.exports = {
  buildSemanticRepairMessages,
  deterministicExpectedTokens,
  extractResultTokens,
  hasReasoningTrace,
  hasVerificationTrace,
  splitAnswerUnits,
  validateSemanticCompleteness,
};
