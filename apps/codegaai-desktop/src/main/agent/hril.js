"use strict";
/**
 * agent/hril.js — Human Reasoning & Interpretation Layer (HRIL)
 * ------------------------------------------------------------
 * Deterministic post-verification formatter. It does not solve the problem again;
 * it turns already verified raw math/logical results into human-readable meaning.
 *
 * Pipeline position: RPRE -> EBSE -> MLVC -> AVE -> MCE -> [HRIL] -> Response
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

function round(n, digits = 2) {
  return Number(Number(n).toFixed(digits));
}

function formatDecimal(n, digits = 2) {
  const value = round(n, digits);
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function gcd(a, b) {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function containsHumanSection(answer) {
  return /insan yorumu|human interpretation|final cevap|sonuc:/i.test(trFold(answer));
}

function parseFirstNumber(text) {
  const m = String(text || "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
}

function parseFinalAnswerSegment(answer) {
  const m = String(answer || "").match(/Final Answer:\s*([\s\S]+)$/i);
  return m ? m[1].trim() : String(answer || "").trim();
}

function parseFraction(answer) {
  const m = parseFinalAnswerSegment(answer).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  const div = gcd(n, d);
  return { n: n / div, d: d / div, value: n / d };
}

function parseMoney(question, answer) {
  const q = trFold(question);
  if (!/\btl\b|lira|fiyat|urun/.test(q)) return null;
  const baseM = q.match(/(\d+(?:[.,]\d+)?)\s*tl/);
  const finalText = parseFinalAnswerSegment(answer);
  const finalM = finalText.match(/(\d+(?:[.,]\d+)?)\s*tl/i) || String(answer || "").match(/Final Answer:\s*(\d+(?:[.,]\d+)?)/i);
  if (!baseM || !finalM) return null;
  const base = Number(baseM[1].replace(",", "."));
  const finalValue = Number(finalM[1].replace(",", "."));
  if (!Number.isFinite(base) || !Number.isFinite(finalValue) || base === 0) return null;
  const diff = finalValue - base;
  const pct = (diff / base) * 100;
  return { base, finalValue, diff, pct };
}

function parseDecimalYears(answer) {
  const finalText = parseFinalAnswerSegment(answer);
  const folded = trFold(finalText);
  const m = folded.match(/(-?\d+(?:[.,]\d+)?)\s*(?:yil|year|years)/i) || folded.match(/^(-?\d+[.,]\d+)$/);
  if (!m) return null;
  const years = Number(m[1].replace(",", "."));
  if (!Number.isFinite(years) || Number.isInteger(years)) return null;
  const whole = Math.trunc(years);
  const months = Math.round((years - whole) * 12);
  return { years, whole, months };
}

function parseDecimalHours(answer) {
  const finalText = parseFinalAnswerSegment(answer);
  const m = finalText.match(/(-?\d+(?:[.,]\d+)?)\s*(?:saat|hour|hours)/i) || finalText.match(/^(-?\d+[.,]\d+)$/);
  if (!m) return null;
  const hours = Number(m[1].replace(",", "."));
  if (!Number.isFinite(hours) || Number.isInteger(hours)) return null;
  const whole = Math.trunc(hours);
  const minutes = Math.round((hours - whole) * 60);
  return { hours, whole, minutes };
}

function finalLine(answer) {
  const segment = parseFinalAnswerSegment(answer);
  return segment ? `Final Answer: ${segment}` : "";
}

function appendInterpretation(answer, lines) {
  const existing = String(answer || "").trim();
  const cleanLines = lines.filter(Boolean);
  if (!cleanLines.length) return existing;
  return `${existing}\n\nİnsan Yorumu:\n${cleanLines.map((line) => `- ${line}`).join("\n")}`;
}

function interpret(question, answer) {
  const original = String(answer || "").trim();
  if (!original || containsHumanSection(original)) return { changed: false, answer: original, confidence: 100 };

  const q = trFold(question);
  const additions = [];

  const fraction = parseFraction(original);
  if (fraction && (/olasilik|ihtimal|probability|sans|top/.test(q) || /\/\d+/.test(original))) {
    const pct = fraction.value * 100;
    additions.push(`${fraction.n}/${fraction.d} olasılık yaklaşık %${formatDecimal(pct, 2)} demektir; yani ${fraction.d} benzer durumdan ${fraction.n} tanesi.`);
  }

  const money = parseMoney(question, original);
  if (money) {
    const direction = money.diff > 0 ? "daha yüksek" : money.diff < 0 ? "daha düşük" : "aynı";
    additions.push(`Başlangıç ${formatDecimal(money.base)} TL, son fiyat ${formatDecimal(money.finalValue)} TL. Fark ${formatDecimal(Math.abs(money.diff))} TL ${direction}; toplam değişim %${formatDecimal(Math.abs(money.pct), 2)}.`);
  }

  const years = parseDecimalYears(original);
  if (years) {
    additions.push(`${formatDecimal(years.years, 6)} yıl, günlük dilde ${years.whole} yıl ${years.months} ay eder.`);
  }

  const hours = parseDecimalHours(original);
  if (hours) {
    const text = hours.whole > 0 ? `${hours.whole} saat ${hours.minutes} dakika` : `${hours.minutes} dakika`;
    additions.push(`${formatDecimal(hours.hours, 6)} saat, günlük dilde ${text} eder.`);
  }

  if (!additions.length) return { changed: false, answer: original, confidence: 100 };
  const final = finalLine(original);
  const withInterpretation = appendInterpretation(original, additions);
  return {
    changed: true,
    answer: final && !withInterpretation.endsWith(final) ? `${withInterpretation}\n\n${final}` : withInterpretation,
    confidence: 100,
  };
}

module.exports = {
  interpret,
  trFold,
  parseFraction,
  parseMoney,
  parseDecimalYears,
  parseDecimalHours,
};
