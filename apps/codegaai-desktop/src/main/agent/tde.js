"use strict";
/**
 * agent/tde.js — Task Decomposition Engine (TDE)
 * ------------------------------------------------
 * Permanent middleware for compound prompts. It detects numbered/multi-part
 * requests and enforces: detected tasks must equal completed tasks.
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

function classifyTask(body) {
  const q = trFold(body);
  if (/%|yuzde|zam|indir|tl|fiyat|urun/.test(q)) return "percentage";
  if (/olasilik|ihtimal|probability|geri koymadan|top cek/.test(q)) return "probability";
  if (/oran|oranti|\d+\s*:\s*\d+|\bkat/.test(q)) return "ratio";
  if (/denklem|katinin|x\s*[+\-=]|sayinin/.test(q)) return "algebra";
  if (/saat|dakika|\d{1,2}:\d{2}|sure/.test(q)) return "time";
  if (/haric|except|geciyorsun|sira|mantik|kapi|door/.test(q)) return "logic";
  if (/kod|site|uygulama|tasarla|hazirla|yap/.test(q)) return "build";
  return "general";
}

function isInstructionItem(body) {
  const q = trFold(body).replace(/\s+/g, " ").trim();
  if (!q) return false;
  const startsLikeInstruction = /^(build|create|write|show|verify|check|calculate|solve|substitute|explain|give|provide|return|list|use|apply|kur|olustur|yaz|goster|dogrula|kontrol|hesapla|coz|yerine koy|acikla|cevapla|ver|listele|kullan|uygula|final answer|son cevap|nihai cevap)\b/.test(q);
  const requiredStep = /(equation|denklem|solve|coz|substitute|yerine koy|verification|dogrulama|kontrol|final answer|son cevap|nihai cevap|explanation|aciklama|reasoning|islem)/.test(q);
  const standaloneQuestion = /\?\s*$/.test(q) || /\b(kac|nedir|hangisi|olasiligi|sonuc|how many|what is|which)\b/.test(q);
  const hasFacts = /\d/.test(q) && /(=|x|kat|tl|%|kirmizi|mavi|saat|dakika|haric|except)/.test(q);
  return (startsLikeInstruction || requiredStep) && !standaloneQuestion && !hasFacts;
}

function outputRequirementReport(text, tasks) {
  if (!tasks || tasks.length <= 1) return { isInstructionList: false, requirements: [] };
  const requirements = tasks.filter((task) => isInstructionItem(task.body));
  if (requirements.length !== tasks.length) return { isInstructionList: false, requirements: [] };
  const firstIndex = String(text || "").indexOf(tasks[0].title || "");
  const preamble = firstIndex > 0 ? String(text || "").slice(0, firstIndex).trim() : "";
  const preambleHasProblem = /\d/.test(preamble) && /(=|kat|x|toplam|father|son|baba|ogul|ya[sş]|tl|%)/i.test(trFold(preamble));
  return {
    isInstructionList: preambleHasProblem || requirements.length >= 3,
    requirements: requirements.map((task, i) => ({
      id: task.id || String(i + 1),
      label: `Adım ${i + 1}`,
      body: task.body,
    })),
  };
}

function headingTasks(text) {
  const re = /^[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:(?:test|soru|task|gorev)[^\S\r\n]+)?(\d+|[A-Z])(?:[.)]|[^\S\r\n]*[-–—:])?.*$/gim;
  const matches = [...String(text || "").matchAll(re)]
    .filter((m) => /test|soru|task|gorev|^\s*\d+[.)]/i.test(m[0]));
  if (matches.length <= 1) return [];
  const tasks = matches.map((m, i) => {
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    // Gövde = eşleşen satır + sonraki satırlar (sonraki başlığa kadar). Başlık satırındaki
    // içerik (tek satırlık "1. soru?") DAHİL; yalnız baştaki numara/işaret eki atılır.
    const block = text.slice(start, end).trim();
    const body = block
      .replace(/^[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:(?:test|soru|task|gorev)[^\S\r\n]+)?(?:\d+|[A-Z])(?:[.)]|[^\S\r\n]*[-–—:])?[^\S\r\n]*/i, "")
      .trim();
    return {
      id: String(m[1]),
      label: /test/i.test(m[0]) ? `Test ${m[1]}` : /soru/i.test(m[0]) ? `Soru ${m[1]}` : `Görev ${m[1]}`,
      title: m[0].trim(),
      body: body || block,
      domain: classifyTask(body || block),
    };
  }).filter((task) => task.body);
  const instructions = outputRequirementReport(text, tasks);
  if (instructions.isInstructionList) {
    headingTasks.lastOutputRequirements = instructions.requirements;
    return [];
  }
  headingTasks.lastOutputRequirements = [];
  return tasks;
}

function questionTasks(text) {
  const raw = String(text || "").trim();
  if (!raw || headingTasks(raw).length) return [];
  const questionParts = raw
    .split(/(?<=[?？])\s+(?=[A-ZÇĞİÖŞÜ0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (questionParts.length <= 1) return [];
  return questionParts.map((body, i) => ({
    id: String(i + 1),
    label: `Soru ${i + 1}`,
    title: `Soru ${i + 1}`,
    body,
    domain: classifyTask(body),
  }));
}

function mkTask(i, body) {
  const b = String(body || "").trim();
  const lm = b.match(/^([\wÇĞİÖŞÜçğıöşü .]{1,24}):\s*(\S[\s\S]*)$/);
  const label = lm ? lm[1].trim() : `Görev ${i + 1}`;
  return { id: String(i + 1), label, title: label, body: b, domain: classifyTask(b) };
}

/** Madde imli liste: "* …", "- …", "• …" (≥2 madde). */
function bulletTasks(text) {
  const items = [];
  for (const ln of String(text || "").split(/\r?\n/)) {
    const m = ln.match(/^\s*[-*•–—]\s+(.+\S)\s*$/);
    if (m) items.push(m[1].trim());
  }
  if (items.length <= 1) return [];
  const tasks = items.map((body, i) => mkTask(i, body));
  const instructions = outputRequirementReport(text, tasks.map((task, i) => ({ ...task, title: items[i] })));
  if (instructions.isInstructionList) {
    bulletTasks.lastOutputRequirements = instructions.requirements;
    return [];
  }
  bulletTasks.lastOutputRequirements = [];
  return tasks;
}

/** Satır bazlı liste: her satır görev sinyali taşımalı ("?" ile biter VEYA "Etiket:" deseni). */
function lineTasks(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  const looksTask = (l) => /\?\s*$/.test(l) || /^[\wÇĞİÖŞÜçğıöşü .]{1,24}:\s*\S/.test(l);
  const taskLines = lines.filter(looksTask);
  // Yalnızca TÜM satırlar görev gibi görünüyorsa böl (rastgele düz metni bölme)
  if (taskLines.length < 2 || taskLines.length !== lines.length) return [];
  return taskLines.map((body, i) => mkTask(i, body));
}

function decomposeTasks(input) {
  const text = String(input || "");
  headingTasks.lastOutputRequirements = [];
  bulletTasks.lastOutputRequirements = [];
  let tasks = headingTasks(text);
  let outputRequirements = headingTasks.lastOutputRequirements || [];
  if (tasks.length <= 1) tasks = bulletTasks(text);
  if (!outputRequirements.length) outputRequirements = bulletTasks.lastOutputRequirements || [];
  if (tasks.length <= 1) tasks = questionTasks(text);
  if (tasks.length <= 1) tasks = lineTasks(text);
  return {
    applicable: tasks.length > 1,
    count: tasks.length,
    tasks,
    outputRequirements,
    instructionOnly: !!outputRequirements.length && tasks.length <= 1,
    confidence: 100,
  };
}

function formatTaskContext(report) {
  if (!report) return "";
  if (!report.applicable && report.outputRequirements && report.outputRequirements.length) {
    return [
      "## Output Requirements Report",
      "Detected Type: one problem with required solution steps",
      "Rule: do not split these steps into independent tasks; apply every step to the same original problem and preserve all facts.",
      ...report.outputRequirements.map((req) => `- ${req.label}: ${req.body.replace(/\s+/g, " ").slice(0, 180)}`),
    ].join("\n");
  }
  if (!report.applicable) return "";
  const lines = [
    "## Task Decomposition Report",
    `Detected Tasks: ${report.count}`,
    "Rule: one task = one reasoning chain; answer every task independently; do not merge unrelated tasks.",
  ];
  for (const task of report.tasks) {
    lines.push(`- ${task.label} [${task.domain}]: ${task.body.replace(/\s+/g, " ").slice(0, 180)}`);
  }
  lines.push("Before final response: Completed Tasks must equal Detected Tasks.");
  return lines.join("\n");
}

function validateTaskCoverage(answer, report) {
  if (!report || !report.applicable) return { ok: true, missing: [], completed: [], expected: 0, confidence: 100 };
  const a = trFold(answer);
  const completed = [];
  const missing = [];
  for (const task of report.tasks) {
    const label = trFold(task.label);
    const id = trFold(task.id);
    const patterns = [
      label,
      `test ${id}`,
      `soru ${id}`,
      `gorev ${id}`,
      `${id}:`,
      `${id}.`,
    ];
    if (patterns.some((p) => p && a.includes(p))) completed.push(task);
    else missing.push(task);
  }
  return {
    ok: missing.length === 0,
    missing,
    completed,
    expected: report.count,
    confidence: missing.length === 0 ? 100 : Math.max(0, Math.round((completed.length / report.count) * 100)),
  };
}

function buildCoverageRepairMessages(question, answer, report, coverage) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Task Completion Repair Gate.",
        "The previous answer missed one or more decomposed tasks.",
        "Rewrite the response so every detected task is answered independently.",
        "Preserve all constraints. Do not merge tasks. Use labels like Test 1 / Soru 1.",
        "Return the complete corrected answer only.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        formatTaskContext(report),
        `Missing tasks: ${coverage.missing.map((t) => t.label).join(", ")}`,
        `Original request:\n${question}`,
        `Previous answer:\n${answer}`,
      ].join("\n\n"),
    },
  ];
}

module.exports = {
  decomposeTasks,
  formatTaskContext,
  validateTaskCoverage,
  buildCoverageRepairMessages,
  classifyTask,
  trFold,
};
