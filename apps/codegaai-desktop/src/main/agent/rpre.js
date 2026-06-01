"use strict";
/**
 * agent/rpre.js — Ratio & Proportion Reasoning Engine (RPRE)
 * ----------------------------------------------------------
 * DETERMİNİSTİK (model çağrısı YOK). Denklem çözmeden ÖNCE çalışır.
 * Reasoning -> Self Critic -> [RPRE] -> EBSE -> MLVC -> AVE -> MCE
 *
 * TEMEL KURAL: Bir toplamı doğrudan oran değerine bölme. Oranı önce PAYLARA çevir.
 *   Örn: A:B = 3:2, toplam 100  ->  pay = 3+2 = 5,  100/5 = 20,  A=60, B=40.
 *   Örn: Baba = 6 × Oğul, toplam 84  ->  6 pay + 1 pay = 7,  84/7 = 12,  Oğul=12, Baba=72.
 *
 * Kapsam (dürüst sınır): iki-nokta oranlar (a:b[:c...]) + "katı/x times" + toplam.
 */

function trFold(text) {
  return String(text || "").toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}
function round(n, d = 6) { return Number(Number(n).toFixed(d)); }
function approxEqual(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }
function numbersIn(text) {
  return (String(text || "").match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", ".")));
}
function answerHasNumber(answer, value, eps = 1e-6) {
  return numbersIn(answer).some((n) => approxEqual(n, value, eps));
}

/** "a:b" veya "a:b:c" oranı + toplam. Saat (HH:MM) gibi ikili kalıpları ele. */
function detectColonRatio(question) {
  const q = trFold(question);
  const rm = q.match(/(\d+(?:\s*:\s*\d+)+)/);
  if (!rm) return null;
  const parts = rm[1].split(":").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length < 2) return null;
  // Saat gibi görünüyorsa (tek ikili ve "saat/:00" bağlamı) atla
  if (parts.length === 2 && /\bsaat\b|\d+:\d{2}\b/.test(q) && !/oran|ratio|paylas|dagit|toplam/.test(q)) return null;

  let total = null;
  const tm = q.match(/toplam\D{0,15}(\d+(?:[.,]\d+)?)/)
    || q.match(/(\d+(?:[.,]\d+)?)\s*(?:tl|adet|kisi|lira|gram|kg|metre)?\s*(?:yi|i|u)?\s*(?:paylas|dagit|bol|pay\b)/);
  if (tm) total = Number(tm[1].replace(",", "."));
  if (total == null) {
    const ratioSet = new Set(parts);
    const rest = numbersIn(q).filter((n) => !ratioSet.has(n));
    if (rest.length) total = Math.max(...rest);
  }
  if (!Number.isFinite(total) || total <= 0) return null;
  return { kind: "ratio", parts, total };
}

/** "k katı" + "toplam T" (yaş/toplam tipi): büyük=k pay, küçük=1 pay. */
function detectMultiple(question) {
  const q = trFold(question);
  const km = q.match(/(\d+(?:[.,]\d+)?)\s*kat/) ||
    q.match(/=\s*(\d+(?:[.,]\d+)?)\s*(?:x|times|[*×])\s*(?:son|ogul|o[ğg]ul)/);
  const tm = q.match(/toplam\D{0,20}(\d+(?:[.,]\d+)?)/) ||
    q.match(/(?:father\s*\+\s*son|baba\s*\+\s*ogul|baba\s+ile\s+oglunun|baba\s+ile\s+ogulun)\D{0,24}(\d+(?:[.,]\d+)?)/);
  if (!km || !tm) return null;
  const k = Number(km[1].replace(",", "."));
  const total = Number(tm[1].replace(",", "."));
  if (!(k > 0) || !(total > 0)) return null;
  return { kind: "multiple", parts: [k, 1], total };
}

/** Pay modeli: toplam payı bul, birim değeri çıkar, her payın değerini hesapla. */
function buildPartsModel(parts, total) {
  const sumParts = parts.reduce((a, b) => a + b, 0);
  const unit = total / sumParts;
  const values = parts.map((p) => round(p * unit));
  return { sumParts, unit: round(unit), values };
}

/** Oran/orantı tespiti var mı? (RPRE'yi etkinleştirir) */
function isApplicable(question) {
  return !!(detectColonRatio(question) || detectMultiple(question));
}

/**
 * Doğrulama + (gerekirse) yeniden çözüm.
 * Döner: { applicable, status:"APPROVED"|"REJECTED"|"UNKNOWN", model, checks, correctedAnswer, confidence }
 */
function verify(question, answer) {
  const det = detectColonRatio(question) || detectMultiple(question);
  if (!det) return { applicable: false, status: "UNKNOWN", checks: [], correctedAnswer: "", confidence: 0 };

  const ans = String(answer || "");
  const m = buildPartsModel(det.parts, det.total);
  const checks = [];

  // Doğrulama 1: paylar toplamı × birim = toplam
  const sumOk = approxEqual(m.values.reduce((a, b) => a + b, 0), det.total);
  checks.push({ name: "Pay toplamı = toplam", ok: sumOk, detail: `${m.values.join(" + ")} = ${round(m.values.reduce((a, b) => a + b, 0))} (beklenen ${det.total})` });

  // Doğrulama 2: oran korunuyor mu (değerler / birim == paylar)
  const ratioOk = m.values.every((v, i) => approxEqual(v / m.unit, det.parts[i]));
  checks.push({ name: "Oran korunuyor", ok: ratioOk, detail: `${m.values.join(":")} ~ ${det.parts.join(":")}` });

  // Cevap, pay modelinin değerlerini içeriyor mu?
  const answerOk = m.values.every((v) => answerHasNumber(ans, v, 0.001));
  // Sık yapılan HATA: toplamı doğrudan oran değerine bölmek (84/6=14, 100/3=33.3 gibi)
  const directDivErr = det.parts.some((p) => answerHasNumber(ans, round(det.total / p), 0.01)) && !answerOk;
  checks.push({ name: "Cevap pay modeline uyuyor", ok: answerOk, detail: `beklenen değerler: ${m.values.join(", ")}${directDivErr ? " | UYARI: toplam doğrudan orana bölünmüş olabilir" : ""}` });

  const eqFail = !sumOk || !ratioOk;
  const status = (answerOk && !eqFail) ? "APPROVED" : "REJECTED";

  let correctedAnswer = "";
  if (status === "REJECTED") {
    const partsTxt = det.kind === "multiple"
      ? `büyük = ${det.parts[0]} pay, küçük = 1 pay`
      : det.parts.map((p, i) => `${i + 1}. değer = ${p} pay`).join(", ");
    const valuesTxt = det.kind === "multiple"
      ? `Küçük = ${m.values[1]}, Büyük = ${m.values[0]}`
      : m.values.map((v, i) => `${i + 1}. değer = ${v}`).join(", ");
    const finalTxt = det.kind === "multiple" ? `${m.values[0]} ve ${m.values[1]}` : m.values.join(", ");
    correctedAnswer =
      `Pay modeli (oran doğrudan bölünmez):\n` +
      `${partsTxt} → toplam ${m.sumParts} pay.\n` +
      `${det.total} ÷ ${m.sumParts} = ${m.unit} (birim).\n` +
      `${valuesTxt}.\n` +
      `Doğrulama: ${m.values.join(" + ")} = ${det.total} ✓\n\n` +
      `Final Answer: ${finalTxt}`;
  }

  const confidence = eqFail ? 50 : (status === "APPROVED" ? 100 : 96);
  return { applicable: true, status, model: { ...det, ...m }, checks, correctedAnswer, confidence };
}

function solveMainTask(question, opts = {}) {
  const det = detectMultiple(question);
  if (!det) return "";
  const model = buildPartsModel(det.parts, det.total);
  const small = model.values[1];
  const big = model.values[0];
  if (!Number.isFinite(small) || !Number.isFinite(big)) return "";
  const q = trFold(question);
  const usesTurkish = /baba|ogul|oğul|yas|yaş/.test(q) || opts.turkish !== false;
  if (!usesTurkish) {
    return [
      `Equation: Son = x, Father = ${det.parts[0]}x, ${det.parts[0]}x + x = ${det.total}.`,
      `Solve: ${det.parts[0] + 1}x = ${det.total}, x = ${small}.`,
      `Substitute back: Son = ${small}, Father = ${big}.`,
      `Verification: ${big} + ${small} = ${det.total}; ${big} = ${det.parts[0]} x ${small}.`,
      `Final Answer: Father ${big}, son ${small}.`,
    ].join("\n");
  }
  return [
    `Denklem: Oğul = x, Baba = ${det.parts[0]}x, ${det.parts[0]}x + x = ${det.total}.`,
    `Hesap: ${det.parts[0] + 1}x = ${det.total}, x = ${small}.`,
    `Geri koyma: Oğul = ${small}, Baba = ${big}.`,
    "Kontrol:",
    `${big} + ${small} = ${det.total}`,
    `${big} = ${det.parts[0]} × ${small}`,
    `Final Answer: Baba ${big}, oğul ${small} yaşındadır.`,
  ].join("\n");
}

module.exports = {
  verify,
  isApplicable,
  detectColonRatio,
  detectMultiple,
  buildPartsModel,
  solveMainTask,
  trFold,
};
