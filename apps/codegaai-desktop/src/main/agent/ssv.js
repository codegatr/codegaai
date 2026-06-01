"use strict";

/**
 * Supreme Sanity Validator
 * -----------------------
 * Final independent reviewer before the answer reaches the user.
 * It checks common-sense consistency, task counts, phantom sections, locked
 * facts, and deterministic math/logic checks. It is intentionally not a prompt.
 */

const factLock = require("./fact-lock");
const finalAnswerSanitizer = require("./final-answer-sanitizer");
const mlvc = require("./mlvc");

const SSV_THRESHOLD = 95;

function trFold(text) {
  return finalAnswerSanitizer.trFold(text);
}

function isProbabilityQuestion(question) {
  return /olasilik|ihtimal|probability|top\s+cek|draw\s+\d+\s+balls?|without\s+replacement|geri\s+koymadan/.test(trFold(question));
}

function scoreFromErrors(errors) {
  if (!errors.length) return 100;
  return Math.max(0, 100 - errors.length * 25);
}

function validateProbabilityTrace(question, answer, deterministic) {
  if (!isProbabilityQuestion(question)) return [];
  const errors = [];
  const a = trFold(answer);
  const checks = (deterministic && deterministic.checks) || [];
  const probabilityChecks = checks.filter((check) => check.kind === "probability");
  if (!probabilityChecks.length) {
    errors.push("SSV probability check failed: no independent probability calculation was available.");
    return errors;
  }
  for (const check of probabilityChecks) {
    const expected = trFold(check.resultText || "");
    const explanation = trFold(check.explanation || "");
    const usesExpected = expected && a.includes(expected);
    const usesSequentialDraw = /\(\s*\d+\s*\/\s*\d+\s*\)\s*x\s*\(\s*\d+\s*\/\s*\d+\s*\)/.test(a) ||
      /\(\s*\d+\s*\/\s*\d+\s*\)\s*x\s*\(\s*\d+\s*\/\s*\d+\s*\)/.test(explanation);
    if (!usesExpected) {
      errors.push(`SSV probability check failed: expected ${check.resultText}, but final answer does not contain it.`);
    }
    if (!usesSequentialDraw) {
      errors.push("SSV probability check failed: answer does not show replacement/non-replacement sequential draw logic.");
    }
  }
  return errors;
}

function validateTaskSanity(question, answer, taskReport) {
  const errors = [];
  const provided = finalAnswerSanitizer.countProvidedTasks(question, taskReport);
  const answered = finalAnswerSanitizer.countAnswerSections(answer);
  if (answered > provided) {
    errors.push(`SSV task completeness failed: answered sections ${answered} exceed provided tasks ${provided}.`);
  }
  const phantom = finalAnswerSanitizer.phantomTaskDetector(answer, question, taskReport);
  const placeholders = finalAnswerSanitizer.emptyPlaceholderDetector(answer, question, taskReport);
  const unrelated = finalAnswerSanitizer.unrelatedSectionDetector(answer, question, taskReport);
  errors.push(...phantom.errors, ...placeholders.errors, ...unrelated.errors);
  return errors;
}

function validateSupremeSanity(question, answer, taskReport = null, opts = {}) {
  let current = String(answer || "").trim();
  const errors = [];
  const corrections = [];

  const finalCheck = finalAnswerSanitizer.validateFinalAnswer(current, question, taskReport);
  if (finalCheck.cleanedAnswer) {
    current = finalCheck.cleanedAnswer;
    corrections.push("output-cleaner");
  }
  if (!finalCheck.ok && !finalCheck.cleanedAnswer) {
    errors.push(...finalCheck.errors.map((error) => `SSV final-answer check failed: ${error}`));
  }

  const facts = opts.factLock || factLock.extractFacts(question);
  const factCheck = factLock.validateFactPreservation(current, facts);
  if (!factCheck.ok) errors.push(...factCheck.errors.map((error) => `SSV fact check failed: ${error}`));

  const deterministic = mlvc.deterministicCheck(question, current);
  if (!deterministic.ok && deterministic.correctedAnswer) {
    current = deterministic.correctedAnswer;
    corrections.push("mlvc-deterministic");
  } else if (!deterministic.ok) {
    errors.push(...(deterministic.failures || []).map((failure) => `SSV deterministic check failed: ${failure.explanation || failure.kind}`));
  }

  errors.push(...validateProbabilityTrace(question, current, deterministic));
  errors.push(...validateTaskSanity(question, current, taskReport));

  const secondFinalCheck = finalAnswerSanitizer.validateFinalAnswer(current, question, taskReport);
  if (secondFinalCheck.cleanedAnswer) {
    current = secondFinalCheck.cleanedAnswer;
    corrections.push("output-cleaner-after-ssv");
  }
  if (!secondFinalCheck.ok && !secondFinalCheck.cleanedAnswer) {
    errors.push(...secondFinalCheck.errors.map((error) => `SSV final-answer recheck failed: ${error}`));
  }

  const uniqueErrors = [...new Set(errors)];
  const confidence = scoreFromErrors(uniqueErrors);
  return {
    ok: confidence >= SSV_THRESHOLD && uniqueErrors.length === 0,
    answer: current,
    correctedAnswer: corrections.length ? current : "",
    corrections,
    errors: uniqueErrors,
    confidence,
    scores: {
      fact: uniqueErrors.some((error) => /fact/i.test(error)) ? 0 : 100,
      constraint: uniqueErrors.some((error) => /constraint|fact/i.test(error)) ? 0 : 100,
      reasoning: uniqueErrors.some((error) => /deterministic|probability/i.test(error)) ? 0 : 100,
      verification: uniqueErrors.some((error) => /check failed/i.test(error)) ? 0 : 100,
      consistency: uniqueErrors.some((error) => /Final Answer|task/i.test(error)) ? 0 : 100,
      commonSense: uniqueErrors.length ? confidence : 100,
    },
  };
}

module.exports = {
  SSV_THRESHOLD,
  validateSupremeSanity,
};
