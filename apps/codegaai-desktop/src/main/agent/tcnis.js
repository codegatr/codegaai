"use strict";

/**
 * Task Completion & Numeric Integrity System (TCNIS)
 * -------------------------------------------------
 * Prevents incomplete answers, numeric corruption, wrong-question answers, and
 * intermediate values being treated as final conclusions.
 */

const { finalAnswerText, trFold } = require("./final-answer-sanitizer");

const TCNIS_THRESHOLD = 95;

function extractNumbers(text) {
  const out = [];
  const re = /-?\d[\d.,]*/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, "");
    let value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value)) value = Number(raw.replace(",", "."));
    out.push({ raw, digits, value, index: m.index });
  }
  return out.filter((item) => item.digits);
}

function extractQuestionTarget(question) {
  const q = trFold(question);
  return {
    asksYearsLater: /kac\D{0,24}(?:yil|sene)\D{0,24}sonra|ka.\D{0,24}y.l\D{0,24}sonra|how\s+many\s+years\s+later/.test(q),
    asksAges: /(?:yas|age|old).{0,24}(?:kac|nedir|what)|baba.{0,20}ogul|father.{0,20}son/.test(q),
    asksProbability: /olasilik|ihtimal|probability/.test(q),
    asksFinalPrice: /son\s+fiyat|final\s+price|fiyat.*kac|tl/.test(q) && /%|zam|indir/.test(q),
    asksBoth: /\b(?:both|ikisinin\s+de|ikisi\s+de)\b/.test(q),
  };
}

function hasYearConclusion(finalText) {
  const f = trFold(finalText);
  return /\d+(?:[.,]\d+)?\s*(?:yil|sene|year)/.test(f) || /final answer:\s*\d+(?:[.,]\d+)?\s*$/i.test(finalText);
}

function hasProbabilityConclusion(finalText) {
  return /\d+\s*\/\s*\d+|%\s*\d+|\d+(?:[.,]\d+)?\s*%/.test(finalText);
}

function hasMoneyConclusion(finalText) {
  return /\d+(?:[.,]\d+)?\s*tl\b/i.test(finalText);
}

function detectNumericCorruption(question, answer) {
  const errors = [];
  const original = extractNumbers(question);
  const produced = extractNumbers(answer);
  const producedDigitSet = new Set(produced.map((item) => item.digits.replace(/^0+(?=\d)/, "")));
  const answerFolded = trFold(answer);

  for (const fact of original) {
    if (fact.digits.length < 4) continue;
    const full = fact.digits.replace(/^0+(?=\d)/, "");
    const suffix = full.slice(-3);
    const hasFull = producedDigitSet.has(full) || answerFolded.includes(full);
    const suffixOnly = produced.some((item) => {
      const normalized = item.digits.replace(/^0+(?=\d)/, "");
      return normalized === suffix.replace(/^0+(?=\d)/, "") && normalized !== full;
    });
    const substringOnly = produced.find((item) => {
      const normalized = item.digits.replace(/^0+(?=\d)/, "");
      return normalized.length >= 2 && normalized.length < full.length && full.includes(normalized);
    });
    if ((suffixOnly || substringOnly) && !hasFull) {
      const corrupted = substringOnly ? substringOnly.raw : suffix;
      errors.push(`TCNIS numeric integrity failed: original number ${fact.raw} appears corrupted as ${corrupted}.`);
    }
  }
  return errors;
}

function detectIntermediateStop(question, answer) {
  const target = extractQuestionTarget(question);
  const final = finalAnswerText(answer) || String(answer || "").trim();
  const errors = [];

  if (target.asksYearsLater && !hasYearConclusion(final)) {
    errors.push("TCNIS completion failed: question asks how many years later, but Final Answer does not provide a years-later value.");
  }
  if (target.asksProbability && !hasProbabilityConclusion(final)) {
    errors.push("TCNIS completion failed: question asks for probability, but Final Answer does not provide a probability.");
  }
  if (target.asksFinalPrice && !hasMoneyConclusion(final)) {
    errors.push("TCNIS completion failed: question asks for final price, but Final Answer does not provide a TL value.");
  }
  if (target.asksBoth && /\bone\b|bir\s+(?:kirmizi|red|mavi|blue|top|ball)/.test(trFold(final)) && !/\b(?:both|ikisi|ikisinin|2)\b/.test(trFold(final))) {
    errors.push("TCNIS plural preservation failed: question asks for both items, but answer appears to discuss only one.");
  }
  return errors;
}

function validateRequestedOutputs(question, answer) {
  const target = extractQuestionTarget(question);
  const final = finalAnswerText(answer) || String(answer || "").trim();
  const errors = [];
  if (!final) {
    errors.push("TCNIS final answer audit failed: final answer is missing.");
    return errors;
  }
  if (target.asksYearsLater && !hasYearConclusion(final)) {
    errors.push("TCNIS requested output missing: years-later result.");
  }
  if (target.asksProbability && !hasProbabilityConclusion(final)) {
    errors.push("TCNIS requested output missing: probability result.");
  }
  if (target.asksFinalPrice && !hasMoneyConclusion(final)) {
    errors.push("TCNIS requested output missing: final price result.");
  }
  return errors;
}

function validateTCNIS(question, answer) {
  const errors = [
    ...detectNumericCorruption(question, answer),
    ...detectIntermediateStop(question, answer),
    ...validateRequestedOutputs(question, answer),
  ];
  const uniqueErrors = [...new Set(errors)];
  const confidence = uniqueErrors.length ? Math.max(0, 100 - uniqueErrors.length * 25) : 100;
  return {
    ok: uniqueErrors.length === 0 && confidence >= TCNIS_THRESHOLD,
    errors: uniqueErrors,
    confidence,
    target: extractQuestionTarget(question),
  };
}

module.exports = {
  TCNIS_THRESHOLD,
  detectIntermediateStop,
  detectNumericCorruption,
  extractNumbers,
  extractQuestionTarget,
  validateRequestedOutputs,
  validateTCNIS,
};
