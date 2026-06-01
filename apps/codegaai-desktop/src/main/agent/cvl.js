"use strict";

/**
 * Correction Verification Layer (CVL)
 * -----------------------------------
 * A correction is not automatically better than the draft it replaces.
 *
 * CVL sits between any self-correction stage and the mutable answer buffer.
 * It independently checks the original draft and the proposed correction, then
 * rejects corrections that introduce mathematically false identities or make a
 * deterministic math/logic answer worse.
 */

const { deterministicCheck } = require("./mlvc");

function trFold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/\u0131/g, "i")
    .replace(/\u0130/g, "i")
    .replace(/\u015f/g, "s")
    .replace(/\u011f/g, "g")
    .replace(/\u00fc/g, "u")
    .replace(/\u00f6/g, "o")
    .replace(/\u00e7/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeSpaces(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function finalAnswerSegment(text) {
  const m = String(text || "").match(/Final Answer\s*:\s*([\s\S]*)/i);
  return normalizeSpaces(m ? m[1] : text);
}

function tokenizeExpression(text) {
  const tokens = [];
  const re = /\s*([a-zA-Z]+|\d+(?:[.,]\d+)?|[()+\-*/])\s*/g;
  let m;
  let last = 0;
  while ((m = re.exec(text))) {
    if (m.index > last && /\S/.test(text.slice(last, m.index))) return null;
    tokens.push(m[1].replace(",", "."));
    last = re.lastIndex;
  }
  if (last < text.length && /\S/.test(text.slice(last))) return null;
  return tokens;
}

function addPoly(a, b, sign = 1) {
  return { c: a.c + sign * b.c, x: a.x + sign * b.x };
}

function mulPoly(a, b) {
  if (a.x !== 0 && b.x !== 0) return null;
  return { c: a.c * b.c, x: a.x * b.c + b.x * a.c };
}

function divPoly(a, b) {
  if (b.x !== 0 || b.c === 0) return null;
  return { c: a.c / b.c, x: a.x / b.c };
}

function parseLinearExpression(text) {
  const tokens = tokenizeExpression(text);
  if (!tokens || !tokens.length) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  function factor() {
    const t = peek();
    if (t === "+") {
      take();
      return factor();
    }
    if (t === "-") {
      take();
      const f = factor();
      return f ? { c: -f.c, x: -f.x } : null;
    }
    if (t === "(") {
      take();
      const e = expr();
      if (take() !== ")") return null;
      return e;
    }
    if (/^\d/.test(t || "")) {
      take();
      const n = Number(t);
      if (!Number.isFinite(n)) return null;
      if (/^[a-zA-Z]+$/.test(peek() || "")) {
        take();
        return { c: 0, x: n };
      }
      return { c: n, x: 0 };
    }
    if (/^[a-zA-Z]+$/.test(t || "")) {
      take();
      return { c: 0, x: 1 };
    }
    return null;
  }

  function term() {
    let left = factor();
    if (!left) return null;
    while (peek() === "*" || peek() === "/") {
      const op = take();
      const right = factor();
      if (!right) return null;
      left = op === "*" ? mulPoly(left, right) : divPoly(left, right);
      if (!left) return null;
    }
    return left;
  }

  function expr() {
    let left = term();
    if (!left) return null;
    while (peek() === "+" || peek() === "-") {
      const op = take();
      const right = term();
      if (!right) return null;
      left = addPoly(left, right, op === "+" ? 1 : -1);
    }
    return left;
  }

  const result = expr();
  if (!result || pos !== tokens.length) return null;
  return {
    c: Math.round(result.c * 1e9) / 1e9,
    x: Math.round(result.x * 1e9) / 1e9,
  };
}

function polyEqual(a, b) {
  return !!a && !!b && Math.abs(a.c - b.c) < 1e-8 && Math.abs(a.x - b.x) < 1e-8;
}

function looksLikeIdentityClaim(a, b) {
  return !!a && !!b && a.x !== 0 && b.x !== 0 && Math.abs(a.x - b.x) < 1e-8;
}

function polyKey(a) {
  if (!a) return "";
  return `${a.x}x+${a.c}`;
}

function extractAlgebraIdentities(text) {
  const lines = String(text || "")
    .replace(/=>|→/g, "\n")
    .split(/\r?\n|[.;]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const identities = [];
  for (const line of lines) {
    if (!/[a-zA-Z]/.test(line) || !/=/.test(line)) continue;
    let cleaned = line
      .replace(/^[^a-zA-Z0-9(+-]*/, "")
      .replace(/[`*_]/g, "")
      .trim();
    const colon = cleaned.indexOf(":");
    const eq = cleaned.indexOf("=");
    if (colon >= 0 && eq > colon) cleaned = cleaned.slice(colon + 1).trim();
    const parts = cleaned.split("=");
    if (parts.length !== 2) continue;
    const leftText = parts[0].trim();
    const rightText = parts[1].trim();
    if (!leftText || !rightText) continue;
    const left = parseLinearExpression(leftText);
    const right = parseLinearExpression(rightText);
    if (!left || !right) continue;
    if (!looksLikeIdentityClaim(left, right)) continue;
    identities.push({
      text: `${leftText} = ${rightText}`,
      leftText,
      rightText,
      left,
      right,
      ok: polyEqual(left, right),
      leftKey: polyKey(left),
    });
  }
  return identities;
}

function validateAlgebraCorrection(originalAnswer, correctedAnswer) {
  const original = extractAlgebraIdentities(originalAnswer);
  const corrected = extractAlgebraIdentities(correctedAnswer);
  const invalidCorrected = corrected.filter((item) => !item.ok);
  if (!invalidCorrected.length) {
    return { ok: true, original, corrected, errors: [] };
  }

  const originalValidLefts = new Set(original.filter((item) => item.ok).map((item) => item.leftKey));
  const replacedValidIdentity = invalidCorrected.some((item) => originalValidLefts.has(item.leftKey));
  return {
    ok: false,
    original,
    corrected,
    errors: invalidCorrected.map((item) => (
      replacedValidIdentity
        ? `CVL rejected correction: valid identity was replaced with false identity "${item.text}".`
        : `CVL rejected correction: false algebra identity "${item.text}".`
    )),
  };
}

function scoreDeterministic(question, answer) {
  const checked = deterministicCheck(question, answer);
  if (!checked.checks || !checked.checks.length) return { applicable: false, ok: true, checked };
  return { applicable: true, ok: checked.ok, checked };
}

function validateCorrection(question, originalAnswer, correctedAnswer, opts = {}) {
  const original = String(originalAnswer || "").trim();
  const corrected = String(correctedAnswer || "").trim();
  const source = opts.source || "unknown";
  if (!corrected || corrected === original) {
    return { accepted: true, answer: original || corrected, confidence: 100, errors: [], source, unchanged: true };
  }

  const algebra = validateAlgebraCorrection(original, corrected);
  if (!algebra.ok) {
    return {
      accepted: false,
      answer: original,
      confidence: 100,
      errors: algebra.errors,
      source,
      detail: { reason: "false_algebra_identity", algebra },
    };
  }

  const before = scoreDeterministic(question, original);
  const after = scoreDeterministic(question, corrected);
  if (before.applicable && after.applicable && before.ok && !after.ok) {
    return {
      accepted: false,
      answer: original,
      confidence: 100,
      errors: [`CVL rejected ${source}: proposed correction fails deterministic verification while original passed.`],
      source,
      detail: { reason: "deterministic_regression", before: before.checked, after: after.checked },
    };
  }

  if (before.applicable && after.applicable && !before.ok && !after.ok) {
    const beforeFinal = finalAnswerSegment(original);
    const afterFinal = finalAnswerSegment(corrected);
    if (beforeFinal && beforeFinal === afterFinal) {
      return {
        accepted: true,
        answer: corrected,
        confidence: 90,
        errors: [],
        source,
        detail: { reason: "same_final_answer_unverified", before: before.checked, after: after.checked },
      };
    }
  }

  return {
    accepted: true,
    answer: corrected,
    confidence: after.applicable && after.ok ? 100 : 95,
    errors: [],
    source,
    detail: { algebra, before: before.checked, after: after.checked },
  };
}

module.exports = {
  extractAlgebraIdentities,
  parseLinearExpression,
  validateAlgebraCorrection,
  validateCorrection,
};
