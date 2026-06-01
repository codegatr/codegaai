"use strict";

const { APPROVAL_THRESHOLD, classifyReasoningProblem, shouldEnforceConclusion } = require("./reasoning-guard");
const errorMemory = require("./error-memory");

const JSON_BLOCK = /```(?:json)?\s*([\s\S]*?)```/i;

function lower(text) {
  return String(text || "").toLocaleLowerCase("tr");
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

function asList(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 12) : [];
}

function score(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function shouldRunCognitivePipeline(input) {
  return shouldEnforceConclusion(input);
}

function analyzeIntent(input) {
  const text = lower(input);
  const categories = classifyReasoningProblem(input);
  const type =
    categories.includes("math") ? "math" :
    categories.includes("logic") ? "logic" :
    /\b(karar|se[cç]|hangisi|öner|oner|recommend|decide)\b/.test(text) ? "decision" :
    /\b(hata|debug|neden|why|error|fix|düzelt|duzelt)\b/.test(text) ? "debug" :
    /\b(yap|oluştur|olustur|hazırla|hazirla|tasarla|kod|site|uygulama)\b/.test(text) ? "build" :
    "general";
  return { type, categories };
}

function extractConstraintSignals(input) {
  const text = String(input || "");
  const l = lower(text);
  const constraints = [];
  const traps = [];
  if (/\b(no|without|yok|olmadan|kullanma|kullanamaz|yasak|de[ğg]il)\b/.test(l)) constraints.push("Negation/prohibition terms are present; do not invert them.");
  if (/\bexcept|hari[cç]|d[ıi][şs][ıi]nda|d[ıi][şs][ıi]ndaki|haricinde\b/.test(l)) traps.push("Exception wording: preserve survivor/remaining meaning exactly.");
  if (/\bevery\s+\d+|her\s+\d+|nth|nci|inci|kap[ıi]|door\b/.test(l)) traps.push("Every-nth/process wording: simulate or use invariants, do not read as first-n items.");
  if (/\b\d+\s*(hap|pill|ila[cç])|her\s+\d+\s*(dakika|dk|minute)/.test(l)) traps.push("Interval wording: first action may happen immediately.");
  if (/\bya[ğg]mur|rain|[şs]emsiye|umbrella|sa[cç][ıi]|hair\b/.test(l)) traps.push("Riddle wording: do not assume forbidden objects; check literal constraints.");
  return { constraints, traps };
}

function buildPreflightMessages(input, intent, priorErrors = []) {
  const memoryContext = errorMemory.correctiveRulesContext();
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's cognitive preflight pipeline.",
        "Do not solve the user request. Build an internal architecture report before reasoning.",
        "Stages: Intent Analyzer, QUE, SIL, QPL, CEE, Ambiguity Detection, Confidence Gate.",
        "QUE extracts user goal, facts, constraints, unknowns, expected output.",
        "SIL compares original question vs parsed question and rejects semantic drift.",
        "QPL preserves critical wording: exceptions, negations, role names, quantities, second/third place, victims/survivors.",
        "CEE extracts all constraints that must remain active during reasoning.",
        "If ambiguous, mark ambiguity and state whether clarification is required.",
        `Confidence rule: understanding, semanticIntegrity, constraintPreservation must be >= ${APPROVAL_THRESHOLD}.`,
        memoryContext,
        "Return ONLY valid JSON:",
        '{"ok":true|false,"intent":"...","parsedQuestion":"...","userGoal":"...","facts":["..."],"constraints":["..."],"unknowns":["..."],"expectedOutput":"number|list|boolean|explanation|decision|recommendation|artifact|unknown","ambiguities":["..."],"potentialTraps":["..."],"forbiddenAssumptions":["..."],"semanticIntegrityScore":0-100,"constraintPreservationScore":0-100,"understandingConfidence":0-100,"summary":"...","errors":["..."]}',
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: [
        `Intent guess: ${intent.type}`,
        `Categories: ${intent.categories.join(", ") || "general"}`,
        priorErrors.length ? `Previous validation errors: ${priorErrors.join("; ")}` : "",
        `Original user request:\n${input}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

function validateSemanticIntegrity(input, report) {
  const l = lower(input);
  const parsed = lower(report.parsedQuestion || report.summary || "");
  const errors = [];
  const warnings = [];
  if (/\bexcept|hari[cç]|d[ıi][şs][ıi]nda|haricinde\b/.test(l) && !/\bexcept|hari[cç]|d[ıi][şs][ıi]nda|haricinde|kalan|surviv|alive|remain|hayatta\b/.test(parsed)) {
    errors.push("SIL: exception wording may have been dropped or inverted.");
  }
  if (/\b(no umbrella|without umbrella|[şs]emsiye yok|[şs]emsiyesiz|[şs]emsiye kullanma)\b/.test(l) && /\bused an umbrella|[şs]emsiye kulland\b/.test(parsed)) {
    errors.push("SIL: forbidden umbrella assumption introduced.");
  }
  if (/\bsecond place|ikinci\b/.test(l) && /\bthird place|ü[cç]üncü|ucuncu\b/.test(parsed)) {
    errors.push("QPL: second place was changed to third place.");
  }
  if (/\bvictim|kurban|[öo]len\b/.test(l) && /\bsurvivor|hayatta|sa[ğg]\b/.test(parsed) && !/\bexcept|hari[cç]/.test(l)) {
    warnings.push("QPL: victim/survivor roles may need explicit preservation.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

async function runCognitivePreflight(input, generateFn, opts = {}) {
  const intent = analyzeIntent(input);
  const signals = extractConstraintSignals(input);
  if (!shouldRunCognitivePipeline(input) || typeof generateFn !== "function") {
    return { ok: true, skipped: true, intent, context: "", report: null };
  }

  let report = null;
  let errors = [];
  const cycles = Math.max(1, Math.min(2, opts.cycles || 2));
  for (let i = 0; i < cycles; i += 1) {
    try {
      const raw = await generateFn(buildPreflightMessages(input, intent, errors));
      const parsed = extractJson(raw);
      if (!parsed || typeof parsed !== "object") {
        errors = ["QUE: malformed preflight report"];
        continue;
      }
      report = {
        ok: parsed.ok !== false,
        intent: String(parsed.intent || intent.type),
        parsedQuestion: String(parsed.parsedQuestion || ""),
        userGoal: String(parsed.userGoal || ""),
        facts: asList(parsed.facts),
        constraints: [...signals.constraints, ...asList(parsed.constraints)],
        unknowns: asList(parsed.unknowns),
        expectedOutput: String(parsed.expectedOutput || "unknown"),
        ambiguities: asList(parsed.ambiguities),
        potentialTraps: [...signals.traps, ...asList(parsed.potentialTraps)],
        forbiddenAssumptions: asList(parsed.forbiddenAssumptions),
        semanticIntegrityScore: score(parsed.semanticIntegrityScore),
        constraintPreservationScore: score(parsed.constraintPreservationScore),
        understandingConfidence: score(parsed.understandingConfidence),
        summary: String(parsed.summary || ""),
        errors: asList(parsed.errors),
      };
      const semantic = validateSemanticIntegrity(input, report);
      errors = [...report.errors, ...semantic.errors];
      if (
        report.ok &&
        semantic.ok &&
        report.semanticIntegrityScore >= APPROVAL_THRESHOLD &&
        report.constraintPreservationScore >= APPROVAL_THRESHOLD &&
        report.understandingConfidence >= APPROVAL_THRESHOLD
      ) break;
      report.ok = false;
      report.errors = errors;
    } catch (_e) {
      errors = ["QUE: preflight generation failed"];
    }
  }

  if (!report) {
    report = {
      ok: false,
      intent: intent.type,
      parsedQuestion: "",
      userGoal: "",
      facts: [],
      constraints: signals.constraints,
      unknowns: [],
      expectedOutput: "unknown",
      ambiguities: [],
      potentialTraps: signals.traps,
      forbiddenAssumptions: [],
      semanticIntegrityScore: 0,
      constraintPreservationScore: 0,
      understandingConfidence: 0,
      summary: "",
      errors,
    };
  }
  if (!report.ok) {
    errorMemory.recordFailure("preflight", (report.errors || errors || [])[0] || "preflight confidence below threshold");
  }
  return { ok: report.ok, intent, report, context: formatCognitiveContext(report) };
}

function formatCognitiveContext(report) {
  if (!report) return "";
  const lines = [
    "## Cognitive Preflight Report",
    `Intent: ${report.intent}`,
    `User goal: ${report.userGoal || report.summary || "unknown"}`,
    `Expected output: ${report.expectedOutput}`,
    `Understanding confidence: ${report.understandingConfidence}`,
    `Semantic integrity: ${report.semanticIntegrityScore}`,
    `Constraint preservation: ${report.constraintPreservationScore}`,
  ];
  if (report.facts.length) lines.push(`Facts: ${report.facts.join("; ")}`);
  if (report.constraints.length) lines.push(`Active constraints: ${report.constraints.join("; ")}`);
  if (report.unknowns.length) lines.push(`Unknowns: ${report.unknowns.join("; ")}`);
  if (report.ambiguities.length) lines.push(`Ambiguities: ${report.ambiguities.join("; ")}`);
  if (report.potentialTraps.length) lines.push(`Potential traps: ${report.potentialTraps.join("; ")}`);
  if (report.forbiddenAssumptions.length) lines.push(`Forbidden assumptions: ${report.forbiddenAssumptions.join("; ")}`);
  if (report.errors.length) lines.push(`Preflight warnings: ${report.errors.join("; ")}`);
  lines.push("Use this report as binding middleware context. Preserve constraints and answer the original request.");
  return lines.join("\n");
}

function buildAdversarialReviewMessages(input, draftAnswer, report) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Adversarial Reasoning Layer and Self-Critic Agent.",
        "Act as an opponent. Try to break the solution before it reaches AVE.",
        "Check: misunderstood question, semantic drift, constraint violation, hidden assumption, math/logical error, hallucination, weak conclusion.",
        `Approval rule: reasoningConfidence and verificationConfidence must be >= ${APPROVAL_THRESHOLD}.`,
        "Return ONLY valid JSON:",
        '{"ok":true|false,"reasoningConfidence":0-100,"verificationConfidence":0-100,"criticReport":["..."],"errors":["..."],"answer":"corrected answer text"}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Original question:\n${input}`,
        `Cognitive preflight:\n${formatCognitiveContext(report)}`,
        `Draft answer:\n${draftAnswer}`,
      ].join("\n\n"),
    },
  ];
}

async function runAdversarialReview(input, draftAnswer, report, generateFn) {
  const current = String(draftAnswer || "").trim();
  if (!shouldRunCognitivePipeline(input) || typeof generateFn !== "function") {
    return { ok: true, answer: current, skipped: true };
  }
  try {
    const raw = await generateFn(buildAdversarialReviewMessages(input, current, report));
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== "object") {
      errorMemory.recordFailure("adversarial", "ARL: malformed critic report");
      return { ok: false, answer: current, errors: ["ARL: malformed critic report"] };
    }
    const reasoningConfidence = score(parsed.reasoningConfidence);
    const verificationConfidence = score(parsed.verificationConfidence);
    const answer = String(parsed.answer || current).trim();
    const ok = parsed.ok !== false &&
      reasoningConfidence >= APPROVAL_THRESHOLD &&
      verificationConfidence >= APPROVAL_THRESHOLD;
    if (!ok) {
      const reason = asList(parsed.errors)[0] || "adversarial confidence below threshold";
      errorMemory.recordFailure("adversarial", reason);
    }
    return {
      ok,
      answer: answer || current,
      reasoningConfidence,
      verificationConfidence,
      criticReport: asList(parsed.criticReport),
      errors: asList(parsed.errors),
    };
  } catch (_e) {
    errorMemory.recordFailure("adversarial", "ARL: critic generation failed");
    return { ok: false, answer: current, errors: ["ARL: critic generation failed"] };
  }
}

module.exports = {
  APPROVAL_THRESHOLD,
  analyzeIntent,
  buildAdversarialReviewMessages,
  buildPreflightMessages,
  extractConstraintSignals,
  formatCognitiveContext,
  runAdversarialReview,
  runCognitivePreflight,
  shouldRunCognitivePipeline,
  validateSemanticIntegrity,
};
