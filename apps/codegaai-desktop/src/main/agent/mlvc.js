"use strict";

const { APPROVAL_THRESHOLD: AVE_THRESHOLD } = require("./reasoning-guard");
const errorMemory = require("./error-memory");

const MLVC_THRESHOLD = 98;
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

function score(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function approxEqual(a, b, eps = 0.0001) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
}

function answerContainsNumber(answer, expected) {
  const nums = String(answer || "").match(/-?\d+(?:[.,]\d+)?/g) || [];
  return nums.some((n) => approxEqual(Number(n.replace(",", ".")), expected));
}

function classifyMLVCDomains(question) {
  const q = lower(question);
  const domains = [];
  if (/%|yüzde|yuzde|zam|indir/.test(q)) domains.push("percentage");
  if (/\b\d+\s*(saat|dakika|gün|gun|hafta|ay|yıl|yil)|\b\d{1,2}:\d{2}\b/.test(q)) domains.push("time");
  if (/\b(x|y|z)\b|denklem|eşitlik|esitlik|çöz|coz/.test(q)) domains.push("algebra");
  if (/kesin|olasılık|olasilik|probability|ihtimal|top çek|top cek|replacement|yerine koy/.test(q)) domains.push("probability");
  if (/tokalaş|tokalas|kaç çift|kac cift|combination|kombinasyon|permütasyon|permutasyon/.test(q)) domains.push("combinatorics");
  if (/mantık|mantik|bulmaca|kapı|kapi|door|hariç|haric|except|yarısı|yarisi|çeyreği|ceyregi|sekizde biri/.test(q)) domains.push("logic");
  if (/\d+\s*[\+\-*\/=]\s*\d+/.test(q)) domains.push("arithmetic");
  return [...new Set(domains)];
}

function shouldRunMLVC(question) {
  return classifyMLVCDomains(question).length > 0;
}

function detectPercentageChain(question) {
  const q = lower(question);
  const baseMatch = q.match(/(?:başlangıç|baslangic|ilk|fiyat[ıi]?)\D{0,20}(\d+(?:[.,]\d+)?)\s*tl|(\d+(?:[.,]\d+)?)\s*tl/);
  if (!baseMatch) return null;
  const base = Number((baseMatch[1] || baseMatch[2]).replace(",", "."));
  if (!Number.isFinite(base)) return null;
  const ops = [];
  const re = /%?\s*(\d+(?:[.,]\d+)?)\s*%?\s*(zam|art|yüksel|yuksel|indir|düş|dus|azal)/g;
  let m;
  while ((m = re.exec(q))) {
    const pct = Number(m[1].replace(",", ".")) / 100;
    const kind = m[2];
    ops.push(/zam|art|yüksel|yuksel/.test(kind) ? (1 + pct) : (1 - pct));
  }
  if (!ops.length) return null;
  const result = ops.reduce((v, factor) => v * factor, base);
  return { kind: "percentage", result, explanation: `${base} x ${ops.map((f) => f.toFixed(2)).join(" x ")} = ${Number(result.toFixed(6))}` };
}

function detectHandshake(question) {
  const q = lower(question);
  const m = q.match(/(\d+)\s+kişi/) || q.match(/(\d+)\s+people/);
  if (!m || !/tokalaş|tokalas|handshake/.test(q)) return null;
  const n = Number(m[1]);
  const result = (n * (n - 1)) / 2;
  return { kind: "combinatorics", result, explanation: `C(${n}, 2) = ${result}` };
}

function detectSameColorGuarantee(question) {
  const q = lower(question);
  if (!/ayn[ıi]\s+renkten\s+2|same color/.test(q)) return null;
  const colors = [];
  for (const color of ["kırmızı", "kirmizi", "mavi", "yeşil", "yesil", "red", "blue", "green"]) {
    if (q.includes(color)) colors.push(color);
  }
  const unique = new Set(colors.map((c) => c.replace("kirmizi", "kırmızı").replace("yesil", "yeşil")));
  if (unique.size < 2) return null;
  const result = unique.size + 1;
  return { kind: "probability", result, explanation: `Pigeonhole: ${unique.size} renk varsa aynı renkten 2 garanti etmek için ${unique.size + 1} çekiş gerekir.` };
}

function detectLilyDoubling(question) {
  const q = lower(question);
  const m = q.match(/(\d+)\.?\s*g[üu]n/);
  if (!m || !/nil[üu]fer|iki\s+kat|yar[ıi]s[ıi]|çeyrek|ceyrek|sekizde/.test(q)) return null;
  const full = Number(m[1]);
  const parts = [];
  if (/yar[ıi]s[ıi]/.test(q)) parts.push(`yarısı ${full - 1}. gün`);
  if (/çeyre|ceyre/.test(q)) parts.push(`çeyreği ${full - 2}. gün`);
  if (/sekizde/.test(q)) parts.push(`sekizde biri ${full - 3}. gün`);
  if (!parts.length) return null;
  return { kind: "logic", resultText: parts.join(", "), explanation: `Her gün iki katına çıktığı için her bir yarılama bir gün geriye gider.` };
}

function detectAlgebraEquation(question) {
  const q = lower(question).replace(/\s+/g, "");
  const m = q.match(/([+-]?\d*)x([+-]\d+)=([+-]?\d+)/);
  if (!m) return null;
  const a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  const result = (c - b) / a;
  return { kind: "algebra", result, explanation: `${a}x ${b >= 0 ? "+" : ""}${b} = ${c}; x = (${c} - ${b}) / ${a} = ${result}` };
}

function detectSymbolicSeven(question) {
  const q = lower(question);
  if (/7\s+ile\s+[cç]arp/.test(q) && /21\s+ekle/.test(q) && /7'?ye\s+b[öo]l/.test(q) && /başlangıç|baslangic/.test(q)) {
    return { kind: "algebra", result: 3, explanation: `(7x + 21) / 7 - x = x + 3 - x = 3` };
  }
  return null;
}

function deterministicCheck(question, answer) {
  const checks = [
    detectPercentageChain(question),
    detectHandshake(question),
    detectSameColorGuarantee(question),
    detectLilyDoubling(question),
    detectAlgebraEquation(question),
    detectSymbolicSeven(question),
  ].filter(Boolean);

  if (!checks.length) return { ok: true, checks: [], correctedAnswer: "" };
  const failures = [];
  for (const check of checks) {
    if (Number.isFinite(check.result)) {
      if (!answerContainsNumber(answer, check.result)) failures.push(check);
    } else if (check.resultText && !lower(answer).includes(lower(check.resultText).split(",")[0])) {
      failures.push(check);
    }
  }
  if (!failures.length) return { ok: true, checks, correctedAnswer: "" };
  const lines = failures.map((f) => `MLVC ${f.kind}: ${f.resultText || f.result}. ${f.explanation}`);
  return {
    ok: false,
    checks,
    failures,
    correctedAnswer: `${lines.join("\n")}\n\nFinal Answer: ${failures.map((f) => f.resultText || f.result).join(" | ")}`,
  };
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
  if (!deterministic.ok && deterministic.correctedAnswer) {
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
  verifyMathLogic,
};
