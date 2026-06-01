"use strict";

const { APPROVAL_THRESHOLD: AVE_THRESHOLD } = require("./reasoning-guard");
const errorMemory = require("./error-memory");

const MLVC_THRESHOLD = 98;
const JSON_BLOCK = /```(?:json)?\s*([\s\S]*?)```/i;

function lower(text) {
  return String(text || "").toLocaleLowerCase("tr");
}

function trFold(text) {
  return lower(text)
    .replace(/\u0131/g, "i")
    .replace(/\u011f/g, "g")
    .replace(/\u00fc/g, "u")
    .replace(/\u015f/g, "s")
    .replace(/\u00f6/g, "o")
    .replace(/\u00e7/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Ä±Ä°]/g, "i")
    .replace(/ÄŸ/g, "g")
    .replace(/Ã¼/g, "u")
    .replace(/ÅŸ/g, "s")
    .replace(/Ã¶/g, "o")
    .replace(/Ã§/g, "c")
    .replace(/â€™/g, "'");
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
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch (_e2) {}
    }
  }
  return null;
}

function score(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
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

function approxEqual(a, b, eps = 0.0001) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
}

function answerContainsNumber(answer, expected) {
  const nums = String(answer || "").match(/-?\d+(?:[.,]\d+)?/g) || [];
  return nums.some((n) => approxEqual(Number(n.replace(",", ".")), expected));
}

function formatCheckAnswer(check) {
  return check.resultText || String(Number.isFinite(check.result) ? Number(check.result.toFixed(10)) : "");
}

function splitNumberedTests(question) {
  const text = String(question || "");
  const re = /^[^\S\r\n]*#{0,3}[^\S\r\n]*Test[^\S\r\n]+(\d+).*$/gim;
  const matches = [...text.matchAll(re)];
  if (matches.length <= 1) return [];
  return matches.map((m, i) => {
    const lineEnd = text.indexOf("\n", m.index);
    const start = lineEnd >= 0 ? lineEnd + 1 : m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    return { label: `Test ${m[1]}`, body: text.slice(start, end).trim() };
  }).filter((item) => item.body);
}

function classifyMLVCDomains(question) {
  const q = trFold(question);
  const domains = [];
  if (/%|yuzde|zam|indir/.test(q)) domains.push("percentage");
  if (/\b\d+\s*(saat|dakika|gun|hafta|ay|yil)|\b\d{1,2}:\d{2}\b/.test(q)) domains.push("time");
  if (/\b(x|y|z)\b|denklem|esitlik|coz|katinin\s+\d+\s+fazlasi/.test(q)) domains.push("algebra");
  if (/kesin|olasilik|probability|ihtimal|top cek|replacement|geri koymadan/.test(q)) domains.push("probability");
  if (/tokalas|kac cift|combination|kombinasyon|permutasyon/.test(q)) domains.push("combinatorics");
  if (/mantik|bulmaca|kapi|door|haric|except|yarisi|ceyregi|sekizde biri|sira/.test(q)) domains.push("logic");
  if (/\d+\s*[\+\-*\/=]\s*\d+/.test(q)) domains.push("arithmetic");
  return [...new Set(domains)];
}

function shouldRunMLVC(question) {
  return classifyMLVCDomains(question).length > 0;
}

function detectPercentageChain(question) {
  const q = trFold(question);
  const baseMatch = q.match(/(?:baslangic|ilk|urun|fiyat)\D{0,40}(\d+(?:[.,]\d+)?)\s*tl|(\d+(?:[.,]\d+)?)\s*tl/);
  if (!baseMatch) return null;
  const base = Number((baseMatch[1] || baseMatch[2]).replace(",", "."));
  if (!Number.isFinite(base)) return null;
  const ops = [];
  const re = /%?\s*(\d+(?:[.,]\d+)?)\s*%?\s*(zam|art|yuksel|indir|dus|azal)/g;
  let m;
  while ((m = re.exec(q))) {
    const pct = Number(m[1].replace(",", ".")) / 100;
    ops.push(/zam|art|yuksel/.test(m[2]) ? (1 + pct) : (1 - pct));
  }
  if (!ops.length) return null;
  const result = ops.reduce((v, factor) => v * factor, base);
  return {
    kind: "percentage",
    result,
    resultText: `${Number(result.toFixed(6))} TL`,
    explanation: `${base} x ${ops.map((f) => f.toFixed(2)).join(" x ")} = ${Number(result.toFixed(6))}`,
  };
}

function detectHandshake(question) {
  const q = trFold(question);
  const m = q.match(/(\d+)\s+kisi/) || q.match(/(\d+)\s+people/);
  if (!m || !/tokalas|handshake/.test(q)) return null;
  const n = Number(m[1]);
  const result = (n * (n - 1)) / 2;
  return { kind: "combinatorics", result, explanation: `C(${n}, 2) = ${result}` };
}

function detectSameColorGuarantee(question) {
  const q = trFold(question);
  if (!/ayni\s+renkten\s+2|same color/.test(q)) return null;
  const colors = [];
  for (const color of ["kirmizi", "mavi", "yesil", "red", "blue", "green"]) {
    if (q.includes(color)) colors.push(color);
  }
  const unique = new Set(colors);
  if (unique.size < 2) return null;
  const result = unique.size + 1;
  return { kind: "probability", result, explanation: `${unique.size} renk varsa ayni renkten 2 garanti etmek icin ${result} cekis gerekir.` };
}

function detectLilyDoubling(question) {
  const q = trFold(question);
  const m = q.match(/(\d+)\.?\s*gun/);
  if (!m || !/nilufer|iki\s+kat|yarisi|ceyrek|sekizde/.test(q)) return null;
  const full = Number(m[1]);
  const parts = [];
  if (/yarisi/.test(q)) parts.push(`yarisi ${full - 1}. gun`);
  if (/ceyrek/.test(q)) parts.push(`ceyregi ${full - 2}. gun`);
  if (/sekizde/.test(q)) parts.push(`sekizde biri ${full - 3}. gun`);
  if (!parts.length) return null;
  return { kind: "logic", resultText: parts.join(", "), explanation: "Her gun iki katina ciktigi icin her yarilama bir gun geriye gider." };
}

function detectAlgebraEquation(question) {
  const q = trFold(question).replace(/\s+/g, "");
  const m = q.match(/([+-]?\d*)x([+-]\d+)=([+-]?\d+)/);
  if (!m) return null;
  const a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  const result = (c - b) / a;
  return { kind: "algebra", result, explanation: `${a}x ${b >= 0 ? "+" : ""}${b} = ${c}; x = ${result}` };
}

function detectWordLinearEquation(question) {
  const q = trFold(question);
  const m = q.match(/(\d+)\s+katinin\s+(\d+)\s+fazlasi\s+(\d+)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const result = (c - b) / a;
  return { kind: "algebra", result, explanation: `${a}x + ${b} = ${c}; x = ${result}` };
}

function detectFractionSimplification(question) {
  const m = String(question || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  const div = gcd(n, d);
  return { kind: "fraction", resultText: `${n / div}/${d / div}`, explanation: `${n}/${d}; gcd=${div}; sadelesmis hali ${n / div}/${d / div}` };
}

function parseTurkishDateTime(value) {
  const months = { ocak: 0, subat: 1, mart: 2, nisan: 3, mayis: 4, haziran: 5, temmuz: 6, agustos: 7, eylul: 8, ekim: 9, kasim: 10, aralik: 11 };
  const m = trFold(value).match(/(\d{1,2})\s+([a-z]+)\s+(\d{1,2}):(\d{2})/i);
  if (!m || months[m[2]] == null) return null;
  return new Date(2026, months[m[2]], Number(m[1]), Number(m[3]), Number(m[4]));
}

function detectDuration(question) {
  const matches = trFold(question).match(/\d{1,2}\s+[a-z]+\s+\d{1,2}:\d{2}/g) || [];
  if (matches.length < 2) return null;
  const start = parseTurkishDateTime(matches[0]);
  const end = parseTurkishDateTime(matches[1]);
  if (!start || !end || end < start) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return { kind: "time", resultText: `${hours} saat ${mins} dakika`, explanation: `${minutes} dakika = ${hours} saat ${mins} dakika` };
}

function detectColorWithoutReplacement(question) {
  const q = trFold(question);
  if (!/geri\s+koymadan|without\s+replacement/.test(q)) return null;
  const colors = [
    { keys: ["kirmizi", "red"], count: 0, label: "kirmizi" },
    { keys: ["mavi", "blue"], count: 0, label: "mavi" },
    { keys: ["yesil", "green"], count: 0, label: "yesil" },
    { keys: ["sari", "yellow"], count: 0, label: "sari" },
    { keys: ["siyah", "black"], count: 0, label: "siyah" },
    { keys: ["beyaz", "white"], count: 0, label: "beyaz" },
  ];
  for (const color of colors) {
    for (const key of color.keys) {
      const m = q.match(new RegExp(`(\\d+)\\s+${key}\\b`));
      if (m) {
        color.count = Number(m[1]);
        break;
      }
    }
  }
  const present = colors.filter((color) => Number.isFinite(color.count) && color.count > 0);
  if (present.length < 1) return null;
  const target = present.find((color) => color.keys.some((key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:ikisinin\\s+de|ikisi\\s+de|both\\s+(?:are\\s+)?|both\\s+)${escaped}\\b`).test(q) ||
      new RegExp(`${escaped}\\s+(?:olma\\s+olasiligi|probability)`).test(q);
  }));
  if (!target) return null;
  const drawMatch = q.match(/(\d+)\s*(?:top|ball)s?\s*(?:cek|draw)/);
  const drawCount = drawMatch ? Number(drawMatch[1]) : 2;
  if (drawCount !== 2 || target.count < 2) return null;
  const total = present.reduce((sum, color) => sum + color.count, 0);
  if (total < 2) return null;
  const num = target.count * (target.count - 1);
  const den = total * (total - 1);
  const div = gcd(num, den);
  const fraction = `${num / div}/${den / div}`;
  const percent = (num / den) * 100;
  return {
    kind: "probability",
    resultText: fraction,
    explanation: `(${target.count}/${total}) x (${target.count - 1}/${total - 1}) = ${fraction} ~= %${Number(percent.toFixed(2))}`,
  };
}

function detectBlueWithoutReplacement(question) {
  const q = trFold(question);
  const red = q.match(/(\d+)\s+kirmizi/);
  const blue = q.match(/(\d+)\s+mavi/);
  if (!red || !blue || !/geri\s+koymadan/.test(q) || !/ikisinin\s+de\s+mavi/.test(q)) return null;
  const r = Number(red[1]);
  const b = Number(blue[1]);
  const total = r + b;
  const num = b * (b - 1);
  const den = total * (total - 1);
  const div = gcd(num, den);
  return { kind: "probability", resultText: `${num / div}/${den / div}`, explanation: `(${b}/${total}) x (${b - 1}/${total - 1}) = ${num / div}/${den / div}` };
}

function detectPassingPlace(question) {
  const q = trFold(question);
  const ordinals = [["birinci", 1], ["ikinci", 2], ["ucuncu", 3], ["dorduncu", 4], ["besinci", 5]];
  const found = ordinals.find(([word]) => q.includes(word));
  if (!found || !/geciyorsun|gecersin|pass/.test(q)) return null;
  return { kind: "logic", result: found[1], explanation: `${found[0]} siradaki kisiyi gecersen ${found[1]}. siraya yukselirsin.` };
}

function detectExceptDied(question) {
  const q = trFold(question);
  const m = q.match(/(\d+)['\u2019]?si\s+haric\s+hepsi\s+oldu/);
  if (!m) return null;
  const result = Number(m[1]);
  return { kind: "logic", result, explanation: `"${result}'si haric hepsi oldu" kalan sayinin ${result} oldugu anlamina gelir.` };
}

function detectSymbolicMultiplier(question) {
  const q = trFold(question);
  const mult = q.match(/(\d+)\s+ile\s+carp/);
  const div = q.match(/(\d+)['\u2019]?[ae]\s+bol/);
  const add = q.match(/(\d+)\s+ekle/);
  if (!add || !/baslangic/.test(q) || !/cikar/.test(q)) return null;
  const n = Number((mult || div || [])[1]);
  const k = Number(add[1]);
  if (!Number.isFinite(n) || !Number.isFinite(k) || n === 0) return null;
  const result = k / n;
  return { kind: "algebra", result, explanation: `(${n}x + ${k}) / ${n} - x = ${result}` };
}

function detectSingleDeterministic(question) {
  return [
    detectPercentageChain(question),
    detectHandshake(question),
    detectSameColorGuarantee(question),
    detectLilyDoubling(question),
    detectAlgebraEquation(question),
    detectWordLinearEquation(question),
    detectFractionSimplification(question),
    detectDuration(question),
    detectColorWithoutReplacement(question),
    detectBlueWithoutReplacement(question),
    detectPassingPlace(question),
    detectExceptDied(question),
    detectSymbolicMultiplier(question),
  ].filter(Boolean);
}

function deterministicCheck(question, answer) {
  const checks = detectSingleDeterministic(question);
  if (!checks.length) return { ok: true, checks: [], correctedAnswer: "" };

  const failures = [];
  for (const check of checks) {
    if (Number.isFinite(check.result)) {
      if (!answerContainsNumber(answer, check.result)) failures.push(check);
    } else if (check.resultText && !trFold(answer).includes(trFold(check.resultText).split(",")[0])) {
      failures.push(check);
    }
  }
  if (!failures.length) return { ok: true, checks, correctedAnswer: "" };
  const lines = failures.map((f) => `MLVC ${f.kind}: ${formatCheckAnswer(f)}. ${f.explanation}`);
  return {
    ok: false,
    checks,
    failures,
    correctedAnswer: `${lines.join("\n")}\n\nFinal Answer: ${failures.map(formatCheckAnswer).join(" | ")}`,
  };
}

function solveDeterministic(question) {
  const tests = splitNumberedTests(question);
  if (tests.length) {
    const lines = [];
    const finalParts = [];
    for (const test of tests) {
      const checks = detectSingleDeterministic(test.body);
      if (!checks.length) continue;
      const body = checks.map((c) => `${formatCheckAnswer(c)} (${c.explanation})`).join("; ");
      lines.push(`${test.label}: ${body}`);
      finalParts.push(`${test.label}: ${checks.map(formatCheckAnswer).join(", ")}`);
    }
    // Yalnızca TÜM alt testler deterministik çözülebiliyorsa kısa devre yap.
    if (lines.length === tests.length) {
      return `${lines.join("\n")}\n\nFinal Answer: ${finalParts.join(" | ")}`;
    }
    // Aksi halde kısa devre YAPMA: bazı testler deterministik değil; tüm metne dedektör
    // uygulayıp yalnızca eşleşenleri döndürmek diğer soruları DÜŞÜRÜR. Modelin tüm
    // paketi (her testi) yanıtlamasına izin ver.
    return "";
  }
  const check = deterministicCheck(question, "");
  if (check.checks.length && check.correctedAnswer) return check.correctedAnswer;
  return "";
}

function buildMLVCMessages(question, draftAnswer, domains, deterministic) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Mathematical & Logical Verification Core (MLVC).",
        "You operate AFTER reasoning and BEFORE the final answer.",
        "Never trust the first calculation. Independently recalculate math and stress-test logic.",
        "Check arithmetic, algebra, fractions, percentages via decimal conversion, time via minutes, probability sample/event space, combinatorics, sanity, and final answer match.",
        "Act as an adversarial mathematician. If any attack succeeds, reject and provide a corrected final answer.",
        `Confidence rule: mathConfidence, logicConfidence, verificationConfidence must all be >= ${MLVC_THRESHOLD}.`,
        "Return ONLY valid JSON:",
        '{"ok":true|false,"mathConfidence":0-100,"logicConfidence":0-100,"verificationConfidence":0-100,"errors":["..."],"correctedReasoning":"short private-safe summary","answer":"final answer text"}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Domains: ${domains.join(", ") || "general"}`,
        deterministic && deterministic.checks && deterministic.checks.length
          ? `Deterministic independent checks:\n${deterministic.checks.map((c) => `- ${c.kind}: ${c.explanation}`).join("\n")}`
          : "",
        `Original question:\n${question}`,
        `Draft answer:\n${draftAnswer}`,
        "Verify independently now. JSON only.",
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

function parseMLVCResult(text, fallbackAnswer) {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, malformed: true, answer: String(fallbackAnswer || "").trim(), errors: ["MLVC malformed result"] };
  }
  const result = {
    ok: parsed.ok !== false,
    answer: String(parsed.answer || fallbackAnswer || "").trim(),
    mathConfidence: score(parsed.mathConfidence),
    logicConfidence: score(parsed.logicConfidence),
    verificationConfidence: score(parsed.verificationConfidence),
    correctedReasoning: String(parsed.correctedReasoning || "").trim(),
    errors: Array.isArray(parsed.errors) ? parsed.errors.map(String).slice(0, 8) : [],
    malformed: false,
  };
  if (
    result.mathConfidence < MLVC_THRESHOLD ||
    result.logicConfidence < MLVC_THRESHOLD ||
    result.verificationConfidence < MLVC_THRESHOLD
  ) {
    result.ok = false;
  }
  return result;
}

async function verifyMathLogic(question, draftAnswer, generateFn, opts = {}) {
  const domains = opts.domains || classifyMLVCDomains(question);
  let current = String(draftAnswer || "").trim();
  if (!domains.length && !opts.force) return { answer: current, verified: false, approved: true, domains };

  const deterministic = deterministicCheck(question, current);
  // Çok parçalı girişlerde (çok-test paketi veya birden fazla bağımsız deterministik
  // kontrol) deterministik "düzeltme" cevabın TAMAMININ yerine geçmemeli — yoksa
  // kapsanmayan sorular düşer. Bu durumda bulgular yalnızca LLM doğrulama turuna ipucu
  // olarak verilir (buildMLVCMessages'e geçer), tam cevap korunur.
  const multiPart = splitNumberedTests(question).length > 1 || deterministic.checks.length > 1;
  if (!deterministic.ok && deterministic.correctedAnswer && !multiPart) {
    current = deterministic.correctedAnswer;
    errorMemory.recordFailure("mlvc_deterministic", deterministic.failures[0] ? deterministic.failures[0].kind : "math_logic_mismatch");
  }

  if (typeof generateFn !== "function") {
    return {
      answer: current,
      verified: deterministic.checks.length > 0,
      approved: deterministic.ok,
      domains,
      deterministic,
    };
  }

  let last = null;
  const passes = Math.max(1, Math.min(3, opts.passes || 2));
  for (let i = 0; i < passes; i += 1) {
    try {
      const raw = await generateFn(buildMLVCMessages(question, current, domains, deterministic));
      last = parseMLVCResult(raw, current);
      if (last.answer) current = last.answer;
      if (last.ok && !last.malformed) break;
      if (last.errors && last.errors.length) errorMemory.recordFailure("mlvc", last.errors[0]);
    } catch (_e) {
      errorMemory.recordFailure("mlvc", "generation failed");
      break;
    }
  }

  return {
    answer: current,
    verified: !!last && !last.malformed,
    approved: !!last && last.ok && !last.malformed,
    domains,
    deterministic,
    scores: last ? {
      math: last.mathConfidence,
      logic: last.logicConfidence,
      verification: last.verificationConfidence,
    } : null,
    errors: last ? last.errors : [],
  };
}

module.exports = {
  AVE_THRESHOLD,
  MLVC_THRESHOLD,
  buildMLVCMessages,
  classifyMLVCDomains,
  deterministicCheck,
  parseMLVCResult,
  shouldRunMLVC,
  solveDeterministic,
  verifyMathLogic,
};
