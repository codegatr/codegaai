"use strict";
/**
 * agent/ebse.js — Equation Back-Substitution Engine (EBSE)
 * --------------------------------------------------------
 * DETERMİNİSTİK doğrulayıcı (model çağrısı YOK). Akıl yürütmeden sonra, final onayından
 * önce çalışır. Türetilen değerleri ORİJİNAL denklemlere geri yerine koyar; herhangi bir
 * denklem geçmezse cevabı REDDEDER ve doğru sonucu sıfırdan yeniden hesaplar.
 *
 * Boru hattı: Reasoning -> Self Critic -> [EBSE] -> MLVC -> AVE -> MCE
 *
 * Kapsam (dürüst sınır): genel sembolik cebir DEĞİL. İyi tanımlı, sık görülen kalıplar:
 *  - Toplam + kat sistemi  (A + B = T, A = k·B)  + "kaç X sonra m katı" uzantısı
 *  - Tek doğrusal denklem  (ax + b = c)
 *  - Yüzde zinciri        (taban üzerinde ardışık zam/indirim, yeniden hesapla)
 *  - Kesir/olasılık sadeleştirme (n/d -> en sade hâl)
 */

function trFold(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
function approxEqual(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }
function round(n, d = 6) { return Number(Number(n).toFixed(d)); }

/** Cevap metninden sayıları çıkar (geri-yerine-koyma karşılaştırması için). */
function extractNumbers(text) {
  const out = [];
  const re = /-?\d+(?:[.,]\d+)?/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.push(Number(m[0].replace(",", ".")));
  return out;
}
function answerHasNumber(answer, value, eps = 1e-6) {
  return extractNumbers(answer).some((n) => approxEqual(n, value, eps));
}

// ---------------------------------------------------------------- toplam + kat
/** "toplamı T" + "k katı" kalıbı. Döner: { total, multiplier } | null */
function detectSumMultiple(question) {
  const q = trFold(question);
  const totalM = q.match(/toplam\D{0,20}(\d+(?:[.,]\d+)?)/) ||
    q.match(/(\d+(?:[.,]\d+)?)\s*(?:e|a|dir|dur)?\s*esit/) ||
    q.match(/(?:father\s*\+\s*son|baba\s*\+\s*ogul|baba\s+ile\s+oglunun|baba\s+ile\s+ogulun)\D{0,24}(\d+(?:[.,]\d+)?)/);
  const multM = q.match(/(\d+(?:[.,]\d+)?)\s*kat/) ||
    q.match(/=\s*(\d+(?:[.,]\d+)?)\s*(?:x|times|[*×])\s*(?:son|ogul|o[ğg]ul)/);
  if (!totalM || !multM) return null;
  const total = Number(totalM[1].replace(",", "."));
  const multiplier = Number(multM[1].replace(",", "."));
  if (!Number.isFinite(total) || !Number.isFinite(multiplier) || multiplier <= 0) return null;
  return { total, multiplier };
}

/** "kaç ... sonra m katı" uzantısı. Döner: m | null */
function detectFutureMultiple(question) {
  const q = trFold(question);
  if (!/sonra/.test(q) || !/kat/.test(q)) return null;
  // "sonra ... m katı" — sonra'dan sonraki ilk "m kat"
  const after = q.slice(q.indexOf("sonra"));
  const m = after.match(/(\d+(?:[.,]\d+)?)\s*kat/);
  if (!m) return null;
  const mult = Number(m[1].replace(",", "."));
  return Number.isFinite(mult) && mult > 0 ? mult : null;
}

/** A + B = T, A = k·B  =>  B(küçük)=T/(k+1), A(büyük)=T-B. Opsiyonel: m kat olma zamanı. */
function solveSumMultiple(total, k, futureMult) {
  const smaller = total / (k + 1);
  const bigger = total - smaller;
  const out = { smaller: round(smaller), bigger: round(bigger), total, k };
  if (futureMult && futureMult !== k) {
    // bigger + x = m (smaller + x)  =>  x = (bigger - m*smaller) / (m - 1)
    const x = (bigger - futureMult * smaller) / (futureMult - 1);
    out.futureMult = futureMult;
    out.years = round(x);
  }
  return out;
}

// ------------------------------------------------------------ tek doğrusal denklem
/** "ax + b = c" (rakamsal). Döner: { a, b, c, x } | null */
function detectLinearEquation(question) {
  const q = String(question || "").replace(/\s+/g, "");
  // a x +/- b = c  (a,b,c sayı; x değişken)
  const m = q.match(/(\d+(?:[.,]\d+)?)?\*?x([+\-]\d+(?:[.,]\d+)?)?=(-?\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const a = m[1] ? Number(m[1].replace(",", ".")) : 1;
  const b = m[2] ? Number(m[2].replace(",", ".")) : 0;
  const c = Number(m[3].replace(",", "."));
  if (!a) return null;
  return { a, b, c, x: round((c - b) / a) };
}

// -------------------------------------------------------------------- yüzde zinciri
function detectPercentChain(question) {
  const q = trFold(question);
  // Taban: önce "… TL" (en güvenilir), yoksa "başlangıç/fiyat" çapası. "%20"deki 20'yi
  // taban sanmamak için yüzde işaretli sayıları taban olarak ALMA.
  let base = null;
  const tlM = q.match(/(\d+(?:[.,]\d+)?)\s*tl/);
  if (tlM) base = Number(tlM[1].replace(",", "."));
  else {
    const anchorM = q.match(/(?:baslangic|ilk\s*fiyat|fiyati|fiyat)\D{0,8}(\d+(?:[.,]\d+)?)/);
    if (anchorM) base = Number(anchorM[1].replace(",", "."));
  }
  if (!Number.isFinite(base)) return null;
  const ops = [];
  const re = /(\d+(?:[.,]\d+)?)\s*%?\s*(zam|art|yuksel|indir|dus|azal)/g;
  let m;
  while ((m = re.exec(q))) {
    const pct = Number(m[1].replace(",", ".")) / 100;
    ops.push(/zam|art|yuksel/.test(m[2]) ? 1 + pct : 1 - pct);
  }
  if (!ops.length) return null;
  const result = ops.reduce((v, f) => v * f, base);
  return { base, ops, result: round(result, 4) };
}

// ---------------------------------------------------------- kesir/olasılık sadeleştirme
function detectFraction(question) {
  const m = String(question || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (!d) return null;
  const g = gcd(n, d);
  return { n, d, simplified: `${n / g}/${d / g}`, value: round(n / d) };
}

// --------------------------------------------------------------------- ana doğrulama
/**
 * Geri-yerine-koyma doğrulaması.
 * Döner: {
 *   applicable, status: "APPROVED"|"REJECTED"|"UNKNOWN",
 *   checks: [{name, expected, ok, detail}], correctedAnswer, confidence
 * }
 */
function verify(question, answer) {
  const checks = [];
  const ans = String(answer || "");
  let correctedAnswer = "";
  let applicable = false;

  // 1) Toplam + kat sistemi (+ gelecekte m katı)
  const sm = detectSumMultiple(question);
  if (sm) {
    applicable = true;
    const fut = detectFutureMultiple(question);
    const sol = solveSumMultiple(sm.total, sm.multiplier, fut);
    // Geri yerine koy: büyük + küçük == toplam VE büyük == k·küçük
    const eqA = approxEqual(sol.bigger + sol.smaller, sm.total);
    const eqB = approxEqual(sol.bigger, sm.multiplier * sol.smaller);
    checks.push({ name: "Toplam denklemi", expected: sm.total, ok: eqA, detail: `${sol.bigger} + ${sol.smaller} = ${round(sol.bigger + sol.smaller)} (beklenen ${sm.total})` });
    checks.push({ name: "Kat denklemi", expected: `${sm.multiplier}·küçük`, ok: eqB, detail: `${sol.bigger} = ${sm.multiplier}·${sol.smaller}` });

    // Modelin cevabı doğru türetilmiş değerleri içeriyor mu?
    const hasBig = answerHasNumber(ans, sol.bigger);
    const hasSmall = answerHasNumber(ans, sol.smaller);
    const hasYears = sol.years == null ? true : answerHasNumber(ans, sol.years);
    const answerOk = hasBig && hasSmall && hasYears;
    checks.push({ name: "Cevap tutarlılığı", expected: sol.years != null ? `büyük=${sol.bigger}, küçük=${sol.smaller}, sonuç=${sol.years}` : `büyük=${sol.bigger}, küçük=${sol.smaller}`, ok: answerOk, detail: `cevapta büyük:${hasBig} küçük:${hasSmall}${sol.years != null ? ` sonuç:${hasYears}` : ""}` });

    if (!answerOk) {
      const parts = [`Küçük değer = ${sol.smaller}`, `Büyük değer = ${sol.bigger}`];
      if (sol.years != null) parts.push(`Sonuç: ${sol.years} (büyük+${sol.years} = ${sol.futureMult}·(küçük+${sol.years}))`);
      correctedAnswer = `Geri-yerine-koyma doğrulaması başarısız; çözüm yeniden hesaplandı.\n` +
        `${sol.bigger} + ${sol.smaller} = ${sm.total} ✓, ${sol.bigger} = ${sm.multiplier}·${sol.smaller} ✓.\n` +
        `${parts.join("\n")}\n\nFinal Answer: ${sol.years != null ? sol.years : `${sol.bigger} ve ${sol.smaller}`}`;
    }
  }

  // 2) Tek doğrusal denklem
  const lin = detectLinearEquation(question);
  if (lin) {
    applicable = true;
    const back = lin.a * lin.x + lin.b;
    const ok = approxEqual(back, lin.c);
    const answerOk = answerHasNumber(ans, lin.x);
    checks.push({ name: "Doğrusal denklem", expected: lin.c, ok, detail: `${lin.a}·${lin.x} + ${lin.b} = ${round(back)} (beklenen ${lin.c})` });
    checks.push({ name: "Cevap tutarlılığı (x)", expected: lin.x, ok: answerOk, detail: `cevapta x=${lin.x}: ${answerOk}` });
    if (!answerOk && !correctedAnswer) {
      correctedAnswer = `Geri-yerine-koyma: ${lin.a}·x + ${lin.b} = ${lin.c} => x = ${lin.x}. Doğrulama: ${lin.a}·${lin.x}+${lin.b}=${round(back)}.\n\nFinal Answer: x = ${lin.x}`;
    }
  }

  // 3) Yüzde zinciri
  const pc = detectPercentChain(question);
  if (pc) {
    applicable = true;
    const answerOk = answerHasNumber(ans, pc.result, 0.5);
    checks.push({ name: "Yüzde zinciri", expected: pc.result, ok: answerOk, detail: `${pc.base} × ${pc.ops.map((f) => f.toFixed(2)).join(" × ")} = ${pc.result}` });
    if (!answerOk && !correctedAnswer) {
      correctedAnswer = `Yüzde yeniden hesaplandı: ${pc.base} × ${pc.ops.map((f) => f.toFixed(2)).join(" × ")} = ${pc.result}.\n\nFinal Answer: ${pc.result} TL`;
    }
  }

  // 4) Kesir / olasılık sadeleştirme
  const fr = detectFraction(question);
  if (fr) {
    applicable = true;
    const answerOk = answerHasNumber(ans, fr.value, 0.001) || trFold(ans).includes(trFold(fr.simplified));
    checks.push({ name: "Kesir sadeleştirme", expected: fr.simplified, ok: answerOk, detail: `${fr.n}/${fr.d} = ${fr.simplified} (${fr.value})` });
    // kesirde otomatik düzeltme riskli (soru bağlamına bağlı) — yalnız uyarı, correctedAnswer üretme
  }

  if (!applicable) return { applicable: false, status: "UNKNOWN", checks: [], correctedAnswer: "", confidence: 0 };

  const failed = checks.filter((c) => !c.ok);
  const status = failed.length ? "REJECTED" : "APPROVED";
  // Güven: deterministik; geçerse 100, denklem-içi tutarsızlık varsa düşür
  const eqFails = checks.filter((c) => c.name !== "Cevap tutarlılığı" && !c.ok).length;
  const confidence = eqFails ? 60 : (status === "APPROVED" ? 100 : 95);

  return { applicable: true, status, checks, correctedAnswer, confidence };
}

module.exports = {
  verify,
  detectSumMultiple,
  detectFutureMultiple,
  solveSumMultiple,
  detectLinearEquation,
  detectPercentChain,
  detectFraction,
  extractNumbers,
  trFold,
};
