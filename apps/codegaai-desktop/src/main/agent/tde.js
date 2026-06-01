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

function headingTasks(text) {
  const re = /^[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:(?:test|soru|task|gorev)[^\S\r\n]+)?(\d+|[A-Z])(?:[.)]|[^\S\r\n]*[-–—:])?.*$/gim;
  const matches = [...String(text || "").matchAll(re)]
    .filter((m) => /test|soru|task|gorev|^\s*\d+[.)]/i.test(m[0]));
  if (matches.length <= 1) return [];
  return matches.map((m, i) => {
    const lineEnd = text.indexOf("\n", m.index);
    const start = lineEnd >= 0 ? lineEnd + 1 : m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    return {
      id: String(m[1]),
      label: /test/i.test(m[0]) ? `Test ${m[1]}` : /soru/i.test(m[0]) ? `Soru ${m[1]}` : `Görev ${m[1]}`,
      title: m[0].trim(),
      body,
      domain: classifyTask(body),
    };
  }).filter((task) => task.body);
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

function decomposeTasks(input) {
  const text = String(input || "");
  const tasks = headingTasks(text);
  const fallbackTasks = tasks.length ? tasks : questionTasks(text);
  return {
    applicable: fallbackTasks.length > 1,
    count: fallbackTasks.length,
    tasks: fallbackTasks,
    confidence: fallbackTasks.length > 1 ? 100 : 100,
  };
}

function formatTaskContext(report) {
  if (!report || !report.applicable) return "";
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
