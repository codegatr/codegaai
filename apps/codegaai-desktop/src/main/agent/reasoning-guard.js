"use strict";

const JSON_BLOCK = /```(?:json)?\s*([\s\S]*?)```/i;

function lower(text) {
  return String(text || "").toLocaleLowerCase("tr");
}

function classifyReasoningProblem(question) {
  const q = lower(question);
  const math =
    /\d+\s*[\+\-*\/^=]\s*\d+/.test(q) ||
    /\b(x|y|z)\s*[+\-*\/=]/i.test(question) ||
    /\b(hesapla|çöz|coz|denklem|eşitlik|esitlik|oran|yüzde|yuzde|kaç|kac|calculate|solve|equation|percent)\b/.test(q);
  const logic =
    /\b(mantık|mantik|bulmaca|kapı|kapi|door|doors|logic|puzzle|liar|knight|her\s+\d+|every\s+\d+|nth|divisor|bölen|bolen)\b/.test(q);
  const feedback =
    /\b(yanlış|yanlis|hatalı|hatali|olmadı|olmadi|tekrar|baştan|bastan|wrong|incorrect|try again|from scratch)\b/.test(q);

  const categories = [];
  if (math) categories.push("math");
  if (logic) categories.push("logic");
  if (feedback) categories.push("feedback");
  return categories;
}

function isReasoningProblem(question) {
  return classifyReasoningProblem(question).length > 0;
}

function reasoningSystemInstruction() {
  return [
    "## Reasoning-first protocol",
    "For math, logic, deduction, puzzle, and correction requests, do not pattern-match.",
    "Internally follow exactly: understand the problem, extract facts, build equations or rules, solve, verify, compare with the original question, then answer.",
    "Before finalizing, re-read the question and your derived solution. Check arithmetic, substitutions, units, constraints, and contradictions.",
    "For process puzzles, simulate state or use invariant reasoning; for the 100 doors problem, reason by divisor parity and perfect squares.",
    "If user feedback says the answer was wrong, restart from scratch and do not defend the old conclusion.",
    "Never let the final sentence contradict the computed value. If x = 24, the final answer must say 24, not 1.",
    "Keep hidden reasoning private; output only the concise final answer and enough explanation to be useful.",
  ].join("\n");
}

function buildVerificationMessages(question, draftAnswer, categories = []) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's strict reasoning verifier.",
        "Audit the draft answer for math, logic, problem interpretation, arithmetic, units, constraints, and final-answer consistency.",
        "If the draft is wrong or internally inconsistent, rebuild the solution from scratch and provide the corrected final answer.",
        "For logic puzzles, simulate or use explicit rules; do not rely on memorized patterns unless you verify them.",
        "Return ONLY valid JSON with this schema:",
        '{"ok":true|false,"reasoningConfidence":0-100,"mathVerificationConfidence":0-100,"consistencyConfidence":0-100,"answer":"final answer text"}',
        "Use ok=false if any confidence is below 90 or if the final answer does not match the derivation.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Categories: ${categories.join(", ") || "reasoning"}`,
        `Question:\n${question}`,
        `Draft answer:\n${draftAnswer}`,
        "Verify now. JSON only.",
      ].join("\n\n"),
    },
  ];
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const block = raw.match(JSON_BLOCK);
  const body = block ? block[1].trim() : raw;
  try {
    return JSON.parse(body);
  } catch (_e) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(body.slice(start, end + 1)); } catch (_e2) {}
    }
  }
  return null;
}

function normalizeScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseVerificationResult(text, fallbackAnswer) {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: true,
      answer: String(fallbackAnswer || "").trim(),
      reasoningConfidence: 0,
      mathVerificationConfidence: 0,
      consistencyConfidence: 0,
      malformed: true,
    };
  }
  const result = {
    ok: Boolean(parsed.ok),
    answer: String(parsed.answer || fallbackAnswer || "").trim(),
    reasoningConfidence: normalizeScore(parsed.reasoningConfidence),
    mathVerificationConfidence: normalizeScore(parsed.mathVerificationConfidence),
    consistencyConfidence: normalizeScore(parsed.consistencyConfidence),
    malformed: false,
  };
  if (
    result.reasoningConfidence < 90 ||
    result.mathVerificationConfidence < 90 ||
    result.consistencyConfidence < 90
  ) {
    result.ok = false;
  }
  return result;
}

async function verifyReasoningAnswer(question, draftAnswer, generateFn, opts = {}) {
  const categories = opts.categories || classifyReasoningProblem(question);
  if (!categories.length || typeof generateFn !== "function") {
    return { answer: String(draftAnswer || "").trim(), verified: false, categories };
  }

  let current = String(draftAnswer || "").trim();
  let last = null;
  const passes = Math.max(1, Math.min(3, opts.passes || 2));
  for (let i = 0; i < passes; i++) {
    let raw = "";
    try {
      raw = await generateFn(buildVerificationMessages(question, current, categories));
    } catch (_e) {
      break;
    }
    last = parseVerificationResult(raw, current);
    if (last.answer) current = last.answer;
    if (last.ok && !last.malformed) break;
  }

  return {
    answer: current,
    verified: !!last && !last.malformed,
    categories,
    scores: last ? {
      reasoning: last.reasoningConfidence,
      math: last.mathVerificationConfidence,
      consistency: last.consistencyConfidence,
    } : null,
  };
}

module.exports = {
  classifyReasoningProblem,
  isReasoningProblem,
  reasoningSystemInstruction,
  buildVerificationMessages,
  parseVerificationResult,
  verifyReasoningAnswer,
};
