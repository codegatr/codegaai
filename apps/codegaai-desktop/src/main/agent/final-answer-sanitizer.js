"use strict";

const { sanitizePlaceholderCommandAnswer } = require("./placeholder-command-sanitizer");
const { maybeReplacePartialAnswer } = require("./multi-task-aggregator");
const { repairMojibake } = require("./mojibake");

function trFold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const INTERNAL_SECTION_RE = /(?:^|\n)\s*(?:Anlama|İşlem|Islem|Dogrulama|Doğrulama|Yorum|Reasoning|Thinking|Analysis|Verification|Kontrol|Sonuc|Sonuç)\s*:\s*/i;
const INTERNAL_LINE_RE = /^\s*(?:Anlama|İşlem|Islem|Dogrulama|Doğrulama|Yorum|Reasoning|Thinking|Analysis|Verification|Kontrol|Sonuc|Sonuç)\s*:/i;
const TEST_REPORT_RE = /^\s*Test\s+\d+\s*:\s*(?:geldi|gelmedi)\s*\/\s*(?:geldi|gelmedi)\s*-\s*kaç\s+saniye\s*$/gim;

function finalAnswerText(answer) {
  const matches = [...String(answer || "").matchAll(/Final Answer:\s*([\s\S]*?)(?=\n\s*(?:Anlama:|Islem:|İşlem:|Dogrulama:|Doğrulama:|Yorum:|Reasoning:|Thinking:|Analysis:|Verification:|Final Answer:)|$)/gi)];
  return matches.length ? matches[matches.length - 1][1].trim() : "";
}

function stripInternalLabel(text) {
  return String(text || "")
    .replace(/^\s*Final Answer\s*:\s*/i, "")
    .replace(/^\s*(?:TEST(?:\s+[A-Z])?|MLVC|ARL|SSV|SACV|İnsan Yorumu|Human Comment)\s*:\s*/i, "")
    .trim();
}

function stripInternalSections(answer) {
  let text = String(answer || "").trim();
  if (!text) return text;

  text = text.replace(TEST_REPORT_RE, "").trim();
  const final = finalAnswerText(text);
  if (final) return stripInternalLabel(final);

  if (INTERNAL_SECTION_RE.test(text)) {
    const lines = text.split(/\r?\n/);
    const kept = [];
    let skipping = false;
    for (const line of lines) {
      if (INTERNAL_LINE_RE.test(line)) {
        skipping = true;
        continue;
      }
      if (/^\s*Final Answer\s*:/i.test(line)) {
        skipping = false;
        kept.push(line.replace(/^\s*Final Answer\s*:\s*/i, ""));
        continue;
      }
      if (!skipping) kept.push(line);
    }
    const cleaned = kept.join("\n").trim();
    if (cleaned) text = cleaned;
  }

  text = text.replace(/^\s*Final Answer\s*:\s*/i, "").trim();
  return text;
}

function deduplicateAnswerCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates || []) {
    const clean = repairMojibake(stripInternalLabel(stripInternalSections(candidate)));
    const key = trFold(clean).replace(/\s+/g, " ").trim();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function looksLikePureTestReport(question) {
  const q = String(question || "").trim();
  return Boolean(q && q.replace(TEST_REPORT_RE, "").trim() === "");
}

function cleanUserFacingOutput(answer, question = "", taskReport = null) {
  const original = repairMojibake(String(answer || "").trim());
  if (!original) return { changed: false, answer: original, candidates: [] };

  if (looksLikePureTestReport(question)) {
    return {
      changed: true,
      answer: "Test sonuçlarını aldım. Takılan veya yavaş kalan test varsa Log Merkezi ekran görüntüsünü gönder; ona göre sonraki düzeltmeyi yapalım.",
      candidates: [],
    };
  }

  const multiFix = maybeReplacePartialAnswer(original, question);
  if (multiFix.changed) return { changed: true, answer: repairMojibake(stripInternalSections(multiFix.answer)), candidates: [multiFix.answer] };

  const placeholderFix = sanitizePlaceholderCommandAnswer(original, question);
  if (placeholderFix.changed) return { changed: true, answer: repairMojibake(stripInternalSections(placeholderFix.answer)), candidates: [placeholderFix.answer] };

  const final = finalAnswerText(original);
  const hasInternal = INTERNAL_SECTION_RE.test(original) || /(?:^|[\n|])\s*(?:TEST(?:\s+[A-Z])?|MLVC|ARL|SSV|SACV|İnsan Yorumu|Human Comment)\s*:/im.test(original);
  const hasPipeDump = Boolean(final && final.includes("|"));

  if (final && !hasPipeDump) {
    const cleanedFinal = repairMojibake(stripInternalSections(final));
    return { changed: cleanedFinal !== String(answer || "").trim(), answer: cleanedFinal, candidates: [cleanedFinal] };
  }

  if (!hasInternal && !hasPipeDump) {
    return { changed: original !== String(answer || "").trim(), answer: original, candidates: [] };
  }

  const source = hasPipeDump ? final : original;
  const candidates = deduplicateAnswerCandidates(source.split(hasPipeDump ? /\s*\|\s*/ : /\r?\n+/).filter(Boolean));
  if (!candidates.length) {
    const cleaned = repairMojibake(stripInternalSections(original));
    return { changed: cleaned !== original, answer: cleaned, candidates: [] };
  }

  const expectedCount = taskReport && taskReport.applicable ? Number(taskReport.count || taskReport.tasks?.length || 0) : 0;
  const cleaned = (expectedCount > 1 || candidates.length > 1)
    ? candidates.slice(0, expectedCount > 1 ? expectedCount : candidates.length).map((c, i) => `Test ${i + 1}: ${c}`).join("\n")
    : candidates[0];
  return { changed: cleaned !== original, answer: repairMojibake(cleaned), candidates };
}

function questionLeakEvidence(question, finalText) {
  const q = trFold(question).replace(/\s+/g, " ").trim();
  const f = trFold(finalText).replace(/\s+/g, " ").trim();
  if (q.length >= 35 && f.includes(q.slice(0, 120))) return q.slice(0, 120);
  return "";
}

function countProvidedTasks(question, taskReport = null) {
  if (taskReport && taskReport.applicable) return taskReport.count || 0;
  return 1;
}

function countAnswerSections(answer) {
  const labels = String(answer || "").match(/(?:^|\n)\s*(?:test|soru|görev|gorev|task)\s+\d+\s*[:\n]/gi);
  return labels && labels.length ? labels.length : 1;
}

function cleanPhantomOutput(answer, question, taskReport = null) {
  const original = repairMojibake(String(answer || "").trim());
  const cleaned = repairMojibake(stripInternalSections(original));
  return { changed: cleaned !== original, answer: cleaned, removed: [], providedTaskCount: countProvidedTasks(question, taskReport), answerSectionCount: countAnswerSections(cleaned) };
}

function phantomTaskDetector() { return { ok: true, errors: [] }; }
function emptyPlaceholderDetector(answer) {
  const folded = trFold(answer);
  const errors = [];
  if (/\bcevap\s*:\s*(?:\.{3}|…)/.test(folded)) errors.push("empty_placeholder_detector: placeholder answer detected.");
  return { ok: errors.length === 0, errors };
}
function unrelatedSectionDetector() { return { ok: true, errors: [] }; }

function validateFinalAnswer(answer, question, taskReport = null) {
  const cleaned = cleanPhantomOutput(answer, question, taskReport);
  const candidate = cleaned.changed ? cleaned.answer : repairMojibake(answer);
  const finalText = finalAnswerText(candidate) || stripInternalSections(candidate);
  const errors = [];
  if (!finalText) errors.push("Final Answer section is missing.");
  const leak = questionLeakEvidence(question, finalText);
  if (leak) errors.push(`Question text leaked into Final Answer: ${leak}`);
  return { ok: errors.length === 0, finalText, errors, taskCounts: [], cleanedAnswer: cleaned.changed ? cleaned.answer : "", cleaned, confidence: errors.length ? 0 : 100 };
}

function buildFinalAnswerRepairMessages(question, answer, taskReport, validation) {
  return [
    { role: "system", content: "Rewrite only the final user-facing answer. Do not reveal reasoning, analysis, verification, or Final Answer labels. Do not repeat the question." },
    { role: "user", content: `Errors:\n${(validation.errors || []).join("\n")}\n\nQuestion:\n${question}\n\nAnswer:\n${answer}` },
  ];
}

module.exports = {
  finalAnswerText,
  cleanUserFacingOutput,
  deduplicateAnswerCandidates,
  stripInternalLabel,
  stripInternalSections,
  validateFinalAnswer,
  buildFinalAnswerRepairMessages,
  questionLeakEvidence,
  phantomTaskDetector,
  emptyPlaceholderDetector,
  unrelatedSectionDetector,
  cleanPhantomOutput,
  countAnswerSections,
  countProvidedTasks,
  trFold,
};
