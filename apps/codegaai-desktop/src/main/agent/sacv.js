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
    .filter((part) => part.length >= 1);
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

function hasDecision(text) {
  return /\b(ev[et]|hayir|hayır|yes|no|olabilir|mümkün|mumkun|sec|seç|secil|öner|oner|dogru|doğru|yanlis|yanlış|true|false)\b/i.test(String(text || ""));
}

/** finalText'i görev etiket/id başlıklarına göre bölümlere ayır: Map(taskId -> bölüm metni). */
function buildSectionMap(finalText, tasks) {
  const map = new Map();
  const text = String(finalText || "");
  const positions = [];
  for (const task of tasks) {
    const id = String(task.id || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!id) continue;
    // "Test 1" / "Soru 1" / "Görev 1" / "1:" / "1." / "1)" başlıkları
    const re = new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?(?:test|soru|g[oö]rev|task)?\\s*${id}\\s*[:).\\-–]`, "i");
    const m = text.match(re);
    if (m && m.index != null) positions.push({ id: String(task.id), start: m.index });
  }
  positions.sort((a, b) => a.start - b.start);
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
    map.set(positions[i].id, text.slice(start, end));
  }
  return map;
}

/**
 * Sıra-bağımsız tamamlanma kontrolü. Öncelik:
 *  1) Açık etiket bölümü (Map id->bölüm)
 *  2) Deterministik beklenen sonuç — finalText'in HERHANGİ yerinde
 *  3) Sayısal/token eşleşmesi
 *  4) Anlamsal cevap varlığı (token/karar)
 *  5) Yalnız HİÇBİR görevde açık etiket yoksa sıralı yedek
 * Kural: beklenen cevap finalText'te herhangi bir yerde geçiyorsa görev GEÇER (kesin biçim aranmaz).
 */
function taskCompleteByMeaning(answer, finalText, task, ctx) {
  const hay = `${finalText}\n${answer}`;
  const expectedTokens = deterministicExpectedTokens(task);
  const section = ctx.sectionMap.get(String(task.id));

  // (2) deterministik solver biliyorsa: token herhangi bir yerde -> GEÇER (başarı kriteri)
  if (expectedTokens.length) {
    const present = expectedTokens.some((token) => tokenPresent(hay, token));
    if (present) return { ok: true, method: "deterministic-result", expectedTokens, errors: [] };
  }

  // (1) açık etiket bölümü + (3/4) bölümde sonuç/karar var mı
  if (section != null) {
    const body = section.replace(/^[\s\S]*?[:).\-–]\s*/, "").trim() || section.trim();
    if (extractResultTokens(body).length > 0 || hasDecision(body) || body.length >= 2) {
      return { ok: true, method: "label-section", expectedTokens, errors: [] };
    }
  }

  // deterministik biliniyor ama hiçbir yerde yok -> eksik
  if (expectedTokens.length) {
    return { ok: false, method: "deterministic-result", expectedTokens, errors: [`${task.label} result is missing semantically.`] };
  }

  // (5) yalnız hiçbir görevde açık etiket yoksa sıralı yedek
  if (!ctx.anyLabel) {
    const unit = ctx.units[ctx.index] || "";
    const ok = extractResultTokens(unit).length > 0 || hasDecision(unit) || ctx.units.length >= ctx.taskCount;
    return { ok, method: "sequential-fallback", expectedTokens: [], errors: ok ? [] : [`${task.label} does not have a distinguishable answer.`] };
  }

  return { ok: false, method: "no-match", expectedTokens: [], errors: [`${task.label} answer not matched.`] };
}

function validateSemanticCompleteness(answer, taskReport) {
  if (!taskReport || !taskReport.applicable) {
    return { ok: true, expected: 0, completed: [], missing: [], errors: [], confidence: 100 };
  }

  const finalText = finalAnswerText(answer) || "";
  const units = splitAnswerUnits(finalText);
  const sectionMap = buildSectionMap(finalText, taskReport.tasks);
  const anyLabel = sectionMap.size > 0;
  const completed = [];
  const missing = [];
  const errors = [];

  const traceWarnings = [];
  if (!hasReasoningTrace(answer)) traceWarnings.push("Reasoning trace is missing.");
  if (!hasVerificationTrace(answer)) traceWarnings.push("Verification trace is missing.");

  for (let i = 0; i < taskReport.tasks.length; i += 1) {
    const task = taskReport.tasks[i];
    const result = taskCompleteByMeaning(answer, finalText, task, {
      sectionMap, anyLabel, units, index: i, taskCount: taskReport.tasks.length,
    });
    if (result.ok) completed.push({ task, method: result.method });
    else {
      missing.push(task);
      errors.push(...result.errors);
    }
  }

  // SACV validates semantic completeness, not exact formatting. Missing trace
  // labels should not reject an otherwise complete deterministic answer.
  if (missing.length || completed.length === 0) errors.push(...traceWarnings);

  const ok = errors.length === 0 && missing.length === 0;
  return {
    ok,
    expected: taskReport.count,
    completed,
    missing,
    errors,
    warnings: traceWarnings,
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
  buildSectionMap,
  hasDecision,
  deterministicExpectedTokens,
  extractResultTokens,
  hasReasoningTrace,
  hasVerificationTrace,
  splitAnswerUnits,
  validateSemanticCompleteness,
};
