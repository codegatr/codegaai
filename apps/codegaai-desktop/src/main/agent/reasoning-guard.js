"use strict";

const JSON_BLOCK = /```(?:json)?\s*([\s\S]*?)```/i;
const APPROVAL_THRESHOLD = 95;
const FINAL_ANSWER_RE = /\b(final answer|final cevap|son cevap|sonu[çc]|nihai cevap|cevap)\s*:/i;

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

function questionUnderstandingInstruction() {
  return [
    "## Question Understanding Engine (QUE)",
    "Before solving, first understand exactly what the user asks.",
    "Internally extract: what is asked, what is not asked, given facts, constraints, required output type, and possible wording traps.",
    "Scan for attention traps such as 'all except 9', interval wording, every nth item, hidden assumptions, and contradicted facts.",
    "Logic traps: 'pass the first-place runner' is normally an impossible/invalid premise (no one ahead) unless lapping is stated; 'pass second' => you become second; 'all except N died' => N survived; 'each has K in front and K behind' can be satisfied by a CIRCULAR arrangement — do not answer generic impossibility unless no circular/alternative arrangement satisfies all constraints.",
    "Do not introduce facts not present in the question.",
    "Only reason after the question is understood and the required output is identified.",
    "A correct calculation for a misunderstood question is still wrong.",
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

function mandatoryConclusionInstruction() {
  return [
    "## Mandatory Conclusion Engine (MCE)",
    "Never end a substantive response without answering the actual question.",
    "The user must receive a clear conclusion, result, recommendation, decision, final value, final list, or final output.",
    "Before finalizing, ask internally: if the user reads only the last two lines, did they receive the answer?",
    "For math questions, include a visible 'Final Answer:' line with the final value.",
    "For logic questions, include a visible 'Final Answer:' line with the final conclusion/list/count.",
    "For decisions, recommendations, debugging, and analysis, include a visible final conclusion such as 'Sonuç:' or 'Final Answer:'.",
    "Do not stop after process, context, or explanation. End with the answer.",
  ].join("\n");
}

function shouldVerifyAnswer(question) {
  const q = lower(question);
  return (
    isReasoningProblem(question) ||
    /\b(neden|nasıl|nasil|açıkla|acikla|analiz|karşılaştır|karsilastir|kanıtla|kanitla|ispat|plan|debug|hata|neden oluyor|why|how|explain|analyze|compare|prove|debug)\b/.test(q)
  );
}

function shouldEnforceConclusion(question) {
  const q = lower(question);
  if (!q.trim()) return false;
  if (/^(selam|merhaba|merhabalar|hello|hi|hey|te[sş]ekk[uü]r|sag ol|sa[ğg]ol)\b/.test(q)) return false;
  return true;
}

function shouldUnderstandQuestion(question) {
  return shouldEnforceConclusion(question);
}

function hasVisibleConclusion(answer) {
  const text = String(answer || "").trim();
  if (!text) return false;
  if (FINAL_ANSWER_RE.test(text)) return true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return false;
  const last = lines.slice(-2).join(" ");
  return /\b(sonu[çc]|final|cevap|karar|[öo]neri|open doors|a[çc][ıi]k kap[ıi]lar)\b\s*[:=]/i.test(last);
}

function buildConclusionMessages(question, draftAnswer) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Mandatory Conclusion Engine (MCE).",
        "Your only job is to make the answer complete and conclusive.",
        "Never add unsupported facts. Do not change correct reasoning. Do not make the answer longer than needed.",
        "If the draft already has a clear final answer, keep it and improve only minimally.",
        "If the draft lacks a result, extract the result from the draft when possible; otherwise state the most direct supported conclusion.",
        "The rewritten answer must end with a clearly identifiable 'Final Answer:' section or line.",
        "Return ONLY valid JSON with this schema:",
        '{"ok":true|false,"answer":"rewritten final answer text","errors":["..."]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Question:\n${question}`,
        `Draft answer:\n${draftAnswer}`,
        "Rewrite so the user receives the actual requested result. JSON only.",
      ].join("\n\n"),
    },
  ];
}

function buildUnderstandingMessages(question, categories = []) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Question Understanding Engine (QUE).",
        "Your job is NOT to solve. Your job is to understand the user's request before reasoning begins.",
        "Extract what is asked, what is not asked, given data, constraints, output type, and potential traps.",
        "Do not answer the problem. Do not solve calculations. Do not add external facts.",
        "Return ONLY valid JSON with this schema:",
        '{"ok":true|false,"userWants":"...","givenData":["..."],"notAsked":["..."],"constraints":["..."],"expectedOutput":"number|list|boolean|explanation|decision|recommendation|artifact|unknown","potentialTraps":["..."],"summary":"short internal summary"}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Categories: ${categories.join(", ") || "general"}`,
        `Question:\n${question}`,
        "Understand the question. JSON only.",
      ].join("\n\n"),
    },
  ];
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
      ok: false,
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

async function understandQuestion(question, generateFn, opts = {}) {
  const categories = opts.categories || classifyReasoningProblem(question);
  if (typeof generateFn !== "function" || !shouldUnderstandQuestion(question)) {
    return { ok: false, summary: "", skipped: true };
  }
  try {
    const raw = await generateFn(buildUnderstandingMessages(question, categories));
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== "object") return { ok: false, summary: "", malformed: true };
    return {
      ok: parsed.ok !== false,
      userWants: String(parsed.userWants || "").trim(),
      givenData: Array.isArray(parsed.givenData) ? parsed.givenData.map(String).slice(0, 8) : [],
      notAsked: Array.isArray(parsed.notAsked) ? parsed.notAsked.map(String).slice(0, 8) : [],
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints.map(String).slice(0, 8) : [],
      expectedOutput: String(parsed.expectedOutput || "unknown").trim(),
      potentialTraps: Array.isArray(parsed.potentialTraps) ? parsed.potentialTraps.map(String).slice(0, 8) : [],
      summary: String(parsed.summary || "").trim(),
    };
  } catch (_e) {
    return { ok: false, summary: "", error: "que_generation_failed" };
  }
}

function formatUnderstandingForPrompt(result) {
  if (!result || !result.ok) return "";
  const lines = [
    "## Question Understanding Summary (QUE)",
    `USER WANTS: ${result.userWants || result.summary || "unknown"}`,
    `EXPECTED OUTPUT: ${result.expectedOutput || "unknown"}`,
  ];
  if (result.givenData && result.givenData.length) lines.push(`GIVEN DATA: ${result.givenData.join("; ")}`);
  if (result.constraints && result.constraints.length) lines.push(`CONSTRAINTS: ${result.constraints.join("; ")}`);
  if (result.notAsked && result.notAsked.length) lines.push(`NOT ASKED: ${result.notAsked.join("; ")}`);
  if (result.potentialTraps && result.potentialTraps.length) lines.push(`POTENTIAL TRAPS: ${result.potentialTraps.join("; ")}`);
  lines.push("Use this understanding to answer the actual question. Do not expose this checklist unless the user asks.");
  return lines.join("\n");
}

async function verifyReasoningAnswer(question, draftAnswer, generateFn, opts = {}) {
  return verifyAnswer(question, draftAnswer, generateFn, { ...opts, force: true });
}

async function enforceConclusion(question, draftAnswer, generateFn, opts = {}) {
  const force = !!opts.force;
  const current = String(draftAnswer || "").trim();
  if ((!force && !shouldEnforceConclusion(question)) || hasVisibleConclusion(current) || typeof generateFn !== "function") {
    return { answer: current, enforced: false, approved: hasVisibleConclusion(current) };
  }

  try {
    const raw = await generateFn(buildConclusionMessages(question, current));
    const parsed = extractJson(raw);
    const answer = String((parsed && parsed.answer) || current).trim();
    return {
      answer: answer || current,
      enforced: true,
      approved: Boolean(parsed && parsed.ok !== false && hasVisibleConclusion(answer)),
      errors: parsed && Array.isArray(parsed.errors) ? parsed.errors.map(String).slice(0, 8) : [],
    };
  } catch (_e) {
    return { answer: current, enforced: false, approved: false, errors: ["mce_generation_failed"] };
  }
}

module.exports = {
  APPROVAL_THRESHOLD,
  classifyReasoningProblem,
  questionUnderstandingInstruction,
  shouldUnderstandQuestion,
  shouldEnforceConclusion,
  hasVisibleConclusion,
  isReasoningProblem,
  shouldVerifyAnswer,
  reasoningSystemInstruction,
  answerVerificationInstruction,
  mandatoryConclusionInstruction,
  buildUnderstandingMessages,
  buildVerificationMessages,
  buildConclusionMessages,
  understandQuestion,
  formatUnderstandingForPrompt,
  parseVerificationResult,
  verifyAnswer,
  verifyReasoningAnswer,
  enforceConclusion,
};
