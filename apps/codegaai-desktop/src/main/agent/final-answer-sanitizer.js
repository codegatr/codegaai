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

function stripInternalSections(answer, opts = {}) {
  let text = String(answer || "").trim();
  if (!text) return text;

  text = text.replace(TEST_REPORT_RE, "").trim();
  // ÇOK-GÖREVLİ koruma: keepAllSections=true ise tek "Final Answer:" bloğuna
  // ÇÖKERTME (aksi halde 10 cevaptan yalnız sonuncusu gösterilir). İç-akıl
  // satırlarını temizler ama tüm "Test N:" cevaplarını korur.
  if (!opts.keepAllSections) {
    const final = finalAnswerText(text);
    if (final) return stripInternalLabel(final);
  }

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

function splitKnownAnswerBlocks(answer) {
  const text = String(answer || "").trim();
  if (!text) return [];
  const markers = [
    /(?=^\s*Merhaba\.\s*Buradayım,\s*nasıl yardımcı olayım\?)/gim,
    /(?=^\s*PHP\s+8\.3\s*\+\s*PDO\s+ile\s+güvenli\s+kullanıcı\s+giriş\s+sistemi\s*:)/gim,
    /(?=^\s*Phoenix\s+Görev\s+Planı\s*:)/gim,
  ];
  let indexes = new Set([0, text.length]);
  for (const re of markers) {
    for (const match of text.matchAll(re)) indexes.add(match.index || 0);
  }
  const sorted = [...indexes].sort((a, b) => a - b);
  const blocks = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const part = text.slice(sorted[i], sorted[i + 1]).trim();
    if (part) blocks.push(part);
  }
  return blocks.length > 1 ? blocks : [];
}

function scoreBlockForQuestion(block, question) {
  const b = trFold(block);
  const q = trFold(question);
  let score = 0;
  if (/\bmerhaba\b|\bnasil\b|\bnasilsin\b|\bselam\b/.test(q)) {
    if (/merhaba\.\s*buradayim/.test(b)) score += 100;
    if (/php|phoenix gorev plani|password_verify/.test(b)) score -= 40;
  }
  if (/\bphp\b/.test(q) && /(giris|login|kullanici|kimlik)/.test(q)) {
    if (/password_verify|guvenli kullanici giris|pdo/.test(b)) score += 100;
    if (/phoenix gorev plani|ates fiat|servis otomasyonu/.test(b)) score -= 40;
  }
  if (/(ates fiat|fiat servis|servis otomasyon|is emri|iş emri)/.test(q)) {
    if (/phoenix gorev plani|servis otomasyonu|workorders|is emri|iş emri/.test(b)) score += 100;
    if (/merhaba\.\s*buradayim|password_verify/.test(b)) score -= 35;
  }
  return score;
}

function scopeAnswerToQuestion(answer, question) {
  const blocks = splitKnownAnswerBlocks(answer);
  if (!blocks.length) return { changed: false, answer };
  const ranked = blocks
    .map((block) => ({ block, score: scoreBlockForQuestion(block, question) }))
    .sort((a, b) => b.score - a.score);
  if (ranked[0] && ranked[0].score > 0) {
    return { changed: ranked[0].block.trim() !== String(answer || "").trim(), answer: ranked[0].block.trim() };
  }
  return { changed: false, answer };
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
  let original = repairMojibake(String(answer || "").trim());
  if (!original) return { changed: false, answer: original, candidates: [] };

  const scoped = scopeAnswerToQuestion(original, question);
  if (scoped.changed) original = scoped.answer;

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

  // ÇOK-GÖREVLİ koruma: girdi birden çok bağımsız görevse VE cevap birden çok
  // "Test N:" bölümü içeriyorsa, tek bir trailing "Final Answer:" bloğuna
  // çökertme — tüm bölümleri koru (iç-akıl satırları temizlenir).
  const multiTask = !!(taskReport && taskReport.applicable && Number(taskReport.count || taskReport.tasks?.length || 0) > 1);
  if (multiTask && countAnswerSections(original) > 1) {
    const cleanedAll = repairMojibake(stripInternalSections(original, { keepAllSections: true }));
    if (cleanedAll && countAnswerSections(cleanedAll) > 1) {
      return { changed: cleanedAll !== String(answer || "").trim(), answer: cleanedAll, candidates: [] };
    }
  }

  const final = finalAnswerText(original);
  const hasInternal = INTERNAL_SECTION_RE.test(original) || /(?:^|[\n|])\s*(?:TEST(?:\s+[A-Z])?|MLVC|ARL|SSV|SACV|İnsan Yorumu|Human Comment)\s*:/im.test(original);
  const hasPipeDump = Boolean(final && final.includes("|"));

  if (final && !hasPipeDump) {
    const cleanedFinal = repairMojibake(stripInternalSections(final));
    return { changed: cleanedFinal !== String(answer || "").trim(), answer: cleanedFinal, candidates: [cleanedFinal] };
  }

  if (!hasInternal && !hasPipeDump) {
    return { changed: scoped.changed || original !== String(answer || "").trim(), answer: original, candidates: [] };
  }

  const source = hasPipeDump ? final : original;
  const candidates = deduplicateAnswerCandidates(source.split(hasPipeDump ? /\s*\|\s*/ : /\r?\n+/).filter(Boolean));
  if (!candidates.length) {
    const cleaned = repairMojibake(stripInternalSections(original));
    return { changed: cleaned !== original || scoped.changed, answer: cleaned, candidates: [] };
  }

  const expectedCount = taskReport && taskReport.applicable ? Number(taskReport.count || taskReport.tasks?.length || 0) : 0;
  const cleaned = (expectedCount > 1 || candidates.length > 1)
    ? candidates.slice(0, expectedCount > 1 ? expectedCount : candidates.length).map((c, i) => `Test ${i + 1}: ${c}`).join("\n")
    : candidates[0];
  return { changed: cleaned !== original || scoped.changed, answer: repairMojibake(cleaned), candidates };
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
  // "Test N:", "Test N\n", "**Test N – Etiket**", "Görev N)", "Soru N -" hepsini
  // yakalar. Çok-görevli sıralı çözücü çıktısı **Test N – Etiket** başlıkları
  // kullanır; bu başlıkların da görev bölümü sayılması preservation için şart.
  const labels = String(answer || "").match(/(?:^|\n)\s*(?:\*\*)?\s*(?:test|soru|görev|gorev|task)\s+\d+\s*(?:[:)\n\-–—]|\*\*)/gi);
  return labels && labels.length ? labels.length : 1;
}

function cleanPhantomOutput(answer, question, taskReport = null) {
  const original = repairMojibake(String(answer || "").trim());
  const scoped = scopeAnswerToQuestion(original, question);
  const source = scoped.changed ? scoped.answer : original;
  // ÇOK-GÖREVLİ koruma: birden çok görev + birden çok "Test N:" bölümü varsa
  // tek "Final Answer:" bloğuna çökertme; tüm cevapları koru.
  const multiTask = !!(taskReport && taskReport.applicable && Number(taskReport.count || taskReport.tasks?.length || 0) > 1);
  const keepAll = multiTask && countAnswerSections(source) > 1;
  const cleaned = repairMojibake(stripInternalSections(source, { keepAllSections: keepAll }));
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
  scopeAnswerToQuestion,
  trFold,
};
