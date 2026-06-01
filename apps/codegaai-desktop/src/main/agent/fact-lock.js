"use strict";
/**
 * Fact Lock System
 * ----------------
 * Extracts original numeric facts and structural constraints before reasoning.
 * Reasoning may derive new values, but it may not replace or invert locked facts.
 */

function trFold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/\u0131/g, "i")
    .replace(/\u011f/g, "g")
    .replace(/\u00fc/g, "u")
    .replace(/\u015f/g, "s")
    .replace(/\u00f6/g, "o")
    .replace(/\u00e7/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function numbersIn(text) {
  return (String(text || "").match(/-?\d+(?:[.,]\d+)?/g) || [])
    .map((raw) => ({ raw, value: Number(raw.replace(",", ".")) }))
    .filter((item) => Number.isFinite(item.value));
}

function isInstructionLine(line) {
  const q = trFold(line)
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return false;
  const startsLikeInstruction = /^(build|create|write|show|verify|check|calculate|solve|substitute|explain|give|provide|return|list|use|apply|kur|olustur|yaz|goster|dogrula|kontrol|hesapla|coz|yerine koy|acikla|cevapla|ver|listele|kullan|uygula|final answer|son cevap|nihai cevap)\b/.test(q);
  const requiredStep = /(equation|denklem|solve|coz|substitute|yerine koy|verification|dogrulama|kontrol|final answer|son cevap|nihai cevap|explanation|aciklama|reasoning|islem)/.test(q);
  const standaloneQuestion = /\?\s*$/.test(q) || /\b(kac|nedir|hangisi|olasiligi|sonuc|how many|what is|which)\b/.test(q);
  const hasFacts = /\d/.test(q) && /(=|x|kat|tl|%|kirmizi|mavi|saat|dakika|haric|except)/.test(q);
  return /^\s*\d+[.)]\s*/.test(line) && (startsLikeInstruction || requiredStep) && !standaloneQuestion && !hasFacts;
}

function stripInstructionListMarkers(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !isInstructionLine(line))
    .join("\n");
}

function uniqueNumbers(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item.value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function detectSumMultiple(question) {
  const q = trFold(question);
  const totalMatch =
    q.match(/toplam\D{0,24}(\d+(?:[.,]\d+)?)/) ||
    q.match(/(?:father\s*\+\s*son|baba\s*\+\s*ogul|baba\s+ile\s+oglunun|baba\s+ile\s+ogulun)\D{0,32}(\d+(?:[.,]\d+)?)/);
  const multiplierMatch =
    q.match(/(\d+(?:[.,]\d+)?)\s*(?:x|kat|times|carp)/) ||
    q.match(/=\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(?:son|ogul|o[ğg]ul)/);
  if (!totalMatch || !multiplierMatch) return null;
  const total = Number(totalMatch[1].replace(",", "."));
  const multiplier = Number(multiplierMatch[1].replace(",", "."));
  if (!Number.isFinite(total) || !Number.isFinite(multiplier)) return null;
  return {
    kind: "sum_multiple",
    total,
    multiplier,
    expectedParts: multiplier + 1,
    description: `total=${total}, multiplier=${multiplier}, expectedParts=${multiplier + 1}`,
  };
}

function detectColonRatio(question) {
  const q = trFold(question);
  const ratio = q.match(/(\d+(?:\s*:\s*\d+)+)/);
  if (!ratio || !/oran|ratio|paylas|dagit|toplam/.test(q)) return null;
  const parts = ratio[1].split(":").map((part) => Number(part.trim())).filter((n) => Number.isFinite(n));
  if (parts.length < 2) return null;
  const totalMatch = q.match(/toplam\D{0,24}(\d+(?:[.,]\d+)?)/);
  const total = totalMatch ? Number(totalMatch[1].replace(",", ".")) : null;
  return {
    kind: "colon_ratio",
    parts,
    total,
    expectedParts: parts.reduce((sum, part) => sum + part, 0),
    description: `ratio=${parts.join(":")}${Number.isFinite(total) ? `, total=${total}` : ""}, expectedParts=${parts.reduce((sum, part) => sum + part, 0)}`,
  };
}

function extractFacts(question) {
  const factText = stripInstructionListMarkers(question);
  const numericFacts = uniqueNumbers(numbersIn(factText));
  const constraints = [];
  const sumMultiple = detectSumMultiple(factText);
  if (sumMultiple) constraints.push(sumMultiple);
  const colonRatio = detectColonRatio(factText);
  if (colonRatio) constraints.push(colonRatio);
  return {
    applicable: numericFacts.length > 0 || constraints.length > 0,
    numericFacts,
    constraints,
    confidence: 100,
  };
}

function formatFactLockContext(report) {
  if (!report || !report.applicable) return "";
  const lines = [
    "## Fact Lock Report",
    "Rule: locked original facts must remain available during reasoning. Do not replace, invert, or silently rewrite them.",
  ];
  if (report.numericFacts.length) {
    lines.push(`Locked numeric facts: ${report.numericFacts.map((item) => item.raw).join(", ")}`);
  }
  for (const constraint of report.constraints) {
    lines.push(`Locked constraint [${constraint.kind}]: ${constraint.description}`);
  }
  lines.push("Derived values are allowed only if they preserve every locked fact.");
  return lines.join("\n");
}

function extractPartTotals(answer) {
  const text = trFold(answer);
  const totals = [];
  for (const m of text.matchAll(/toplam\D{0,8}(\d+(?:[.,]\d+)?)\s*pay/g)) totals.push(Number(m[1].replace(",", ".")));
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*pay\s*\+\s*1\s*pay\D{0,16}(\d+(?:[.,]\d+)?)\s*pay/g)) {
    totals.push(Number(m[2].replace(",", ".")));
  }
  return totals.filter((n) => Number.isFinite(n));
}

function validateFactPreservation(answer, report) {
  if (!report || !report.applicable) return { ok: true, errors: [], confidence: 100 };
  const text = trFold(answer);
  const errors = [];
  for (const constraint of report.constraints) {
    if (constraint.kind === "sum_multiple") {
      const expected = constraint.expectedParts;
      const partTotals = extractPartTotals(answer);
      const incompatible = partTotals.filter((value) => Math.abs(value - expected) > 0.0001);
      if (incompatible.length) {
        errors.push(`Fact Lock violation: original multiplier ${constraint.multiplier} requires ${expected} total parts, but reasoning used ${incompatible.join(", ")}.`);
      }
      const forbiddenDivision = new RegExp(`\\b${String(constraint.multiplier).replace(".", "[.,]")}\\s*(?:/|÷|bol|böl)\\s*${String(expected - 2)}\\b`);
      if (forbiddenDivision.test(text)) {
        errors.push(`Fact Lock violation: multiplier ${constraint.multiplier} was divided by an invented part total.`);
      }
    }
    if (constraint.kind === "colon_ratio") {
      const expected = constraint.expectedParts;
      const incompatible = extractPartTotals(answer).filter((value) => Math.abs(value - expected) > 0.0001);
      if (incompatible.length) {
        errors.push(`Fact Lock violation: ratio ${constraint.parts.join(":")} requires ${expected} total parts, but reasoning used ${incompatible.join(", ")}.`);
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    confidence: errors.length ? 0 : 100,
  };
}

module.exports = {
  detectColonRatio,
  detectSumMultiple,
  extractFacts,
  formatFactLockContext,
  numbersIn,
  trFold,
  validateFactPreservation,
};
