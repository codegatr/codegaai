"use strict";

const JSON_BLOCK = /```(?:json)?\s*([\s\S]*?)```/i;
const APPROVAL_THRESHOLD = 95;

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

function answerVerificationInstruction() {
  return [
    "## Answer Verification Engine (AVE)",
    "Before delivering any non-trivial answer, assume the draft may be wrong.",
    "Verify the original request, the draft reasoning, and the final answer for correctness, logic, math, consistency, hallucinations, and completeness.",
    "Score internally: reasoning, math, logic, consistency, completeness. If any score is below 95, reject the draft and rebuild the answer from scratch.",
    "The delivered final answer must match the verified result exactly. Accuracy is more important than speed.",
  ].join("\n");
}

function shouldVerifyAnswer(question) {
  const q = lower(question);
  return (
    isReasoningProblem(question) ||
    /\b(neden|nasıl|nasil|açıkla|acikla|analiz|karşılaştır|karsilastir|kanıtla|kanitla|ispat|plan|debug|hata|neden oluyor|why|how|explain|analyze|compare|prove|debug)\b/.test(q)
  );
}

function buildVerificationMessages(question, draftAnswer, categories = []) {
  return [
    {
      role: "system",
      content: [
        "You are not the primary assistant. You are CODEGA AI's Answer Verification Engine (AVE).",
        "Never trust the draft automatically. Assume it may contain mistakes.",
        "Step 1: understand the original user request: goal, constraints, expected output.",
        "Step 2: verify reasoning: assumptions, formulas, deductions, logic.",
        "Step 3: independently verify calculations: arithmetic, ratios, equations, units, dates, constraints.",
        "Step 4: compare derived result with the final response.",
        "Step 5: detect contradictions, unsupported facts, hallucinations, and missing requirements.",
        "If the draft is wrong, incomplete, hallucinated, or internally inconsistent, reject it and rebuild the answer from scratch.",
        "For logic puzzles, simulate or use explicit rules; do not rely on memorized patterns unless you verify them.",
        `Approval rule: every score must be >= ${APPROVAL_THRESHOLD}. If any score is lower, ok must be false.`,
        "Return ONLY valid JSON with this schema:",
        '{"ok":true|false,"reasoningScore":0-100,"mathScore":0-100,"logicScore":0-100,"consistencyScore":0-100,"completenessScore":0-100,"errors":["..."],"correctedReasoning":"short private-safe summary","answer":"final answer text"}',
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
    reasoningScore: normalizeScore(parsed.reasoningScore ?? parsed.reasoningConfidence),
    mathScore: normalizeScore(parsed.mathScore ?? parsed.mathVerificationConfidence),
    logicScore: normalizeScore(parsed.logicScore ?? parsed.reasoningConfidence),
    consistencyScore: normalizeScore(parsed.consistencyScore ?? parsed.consistencyConfidence),
    completenessScore: normalizeScore(parsed.completenessScore ?? parsed.consistencyConfidence),
    errors: Array.isArray(parsed.errors) ? parsed.errors.map(String).slice(0, 8) : [],
    correctedReasoning: String(parsed.correctedReasoning || "").trim(),
    malformed: false,
  };
  if (
    result.reasoningScore < APPROVAL_THRESHOLD ||
    result.mathScore < APPROVAL_THRESHOLD ||
    result.logicScore < APPROVAL_THRESHOLD ||
    result.consistencyScore < APPROVAL_THRESHOLD ||
    result.completenessScore < APPROVAL_THRESHOLD
  ) {
    result.ok = false;
  }
  return result;
}

async function verifyAnswer(question, draftAnswer, generateFn, opts = {}) {
  const categories = opts.categories || classifyReasoningProblem(question);
  const force = !!opts.force;
  if ((!force && !shouldVerifyAnswer(question)) || typeof generateFn !== "function") {
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
      reasoning: last.reasoningScore,
      math: last.mathScore,
      logic: last.logicScore,
      consistency: last.consistencyScore,
      completeness: last.completenessScore,
    } : null,
    approved: !!last && last.ok && !last.malformed,
    errors: last ? last.errors : [],
  };
}

async function verifyReasoningAnswer(question, draftAnswer, generateFn, opts = {}) {
  return verifyAnswer(question, draftAnswer, generateFn, { ...opts, force: true });
}

module.exports = {
  APPROVAL_THRESHOLD,
  classifyReasoningProblem,
  isReasoningProblem,
  shouldVerifyAnswer,
  reasoningSystemInstruction,
  answerVerificationInstruction,
  buildVerificationMessages,
  parseVerificationResult,
  verifyAnswer,
  verifyReasoningAnswer,
};
