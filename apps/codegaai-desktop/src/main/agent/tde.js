"use strict";

/**
 * Task Decomposition Engine (TDE)
 * -------------------------------
 * Detects truly independent tasks, while keeping numbered solution steps as
 * output requirements attached to one MainTask.
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

function isIgnorableTaskBody(body) {
  const q = trFold(body).replace(/\s+/g, " ").trim();
  if (!q) return true;
  if (/^(not|note|aciklama|açiklama|ornek|example|internal|heading|baslik|başlik)\b/.test(q)) return true;
  if (/^(sistem takildi|takildi|devam et|baglanti geldi|guncelleme|release|github)\b/.test(q) && !/[?=]|\d/.test(q)) return true;
  return false;
}

function isActualTaskBody(body, title = "") {
  const q = trFold(body).replace(/\s+/g, " ").trim();
  const h = trFold(title);
  if (isIgnorableTaskBody(body)) return false;
  if (/[?؟？]\s*$/.test(body) || /\b(kac|nedir|hangisi|olasilik|cevap|answer|solve|coz|hesapla|bul)\b/.test(q)) return true;
  if (/\d/.test(q) && /(=|%|:|x|kat|tl|kirmizi|mavi|koyun|sheep|baba|father|son|ogul|profit|ratio)/.test(q)) return true;
  if (/\b(test|soru|task|gorev)\b/.test(h) && /\d/.test(q)) return true;
  return false;
}

function isInstructionItem(body) {
  const q = trFold(body).replace(/\s+/g, " ").trim();
  if (!q) return false;
  const startsLikeInstruction = /^(build|create|write|show|verify|check|calculate|solve|substitute|explain|give|provide|return|list|use|apply|kur|olustur|yaz|goster|dogrula|kontrol|hesapla|coz|yerine koy|acikla|cevapla|ver|listele|kullan|uygula|final answer|final cevap|son cevap|nihai cevap|denklemi kur|verilen bilgileri yaz)\b/.test(q);
  const requiredStep = /(equation|denklem|solve|coz|substitute|yerine koy|geri koy|verification|dogrulama|kontrol|final answer|final cevap|son cevap|nihai cevap|explanation|aciklama|reasoning|islem|hesapla)/.test(q);
  const standaloneQuestion = /\?\s*$/.test(q) || /\b(kac|nedir|hangisi|olasiligi|sonuc|how many|what is|which)\b/.test(q);
  const hasFacts = /\d/.test(q) && /(=|x|kat|tl|%|kirmizi|mavi|saat|dakika|haric|except)/.test(q);
  return (startsLikeInstruction || requiredStep) && !standaloneQuestion && !hasFacts;
}

function makeOutputRequirements(tasks) {
  return tasks.map((task, i) => ({
    id: task.id || String(i + 1),
    label: `Adim ${i + 1}`,
    body: task.body,
  }));
}

function outputRequirementReport(text, tasks) {
  if (!tasks || tasks.length <= 1) return { isInstructionList: false, requirements: [], mainTask: null };
  const requirements = tasks.filter((task) => isInstructionItem(task.body));
  if (requirements.length !== tasks.length) return { isInstructionList: false, requirements: [], mainTask: null };
  const firstIndex = String(text || "").indexOf(tasks[0].title || "");
  const preamble = firstIndex > 0 ? String(text || "").slice(0, firstIndex).trim() : "";
  const foldedPreamble = trFold(preamble);
  const preambleHasProblem = /\d/.test(preamble) && /(=|kat|x|toplam|father|son|baba|ogul|yas|tl|%)/i.test(foldedPreamble);
  const outputRequirements = makeOutputRequirements(requirements);
  return {
    isInstructionList: preambleHasProblem || requirements.length >= 3,
    requirements: outputRequirements,
    mainTask: {
      problem_text: preamble || String(text || "").trim(),
      facts: [],
      constraints: [],
      output_requirements: outputRequirements,
    },
  };
}

function headingTasks(text) {
  const re = /^[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:(?:test|soru|task|gorev)[^\S\r\n]+)?(\d+|[A-Z])(?:[.)]|[^\S\r\n]*[-:])?.*$/gim;
  const matches = [...String(text || "").matchAll(re)]
    .filter((m) => /test|soru|task|gorev|^\s*\d+[.)]/i.test(m[0]));
  if (matches.length <= 1) return [];
  const parsedTasks = matches.map((m, i) => {
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(start, end).trim();
    const body = block
      .replace(/^[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:(?:test|soru|task|gorev)[^\S\r\n]+)?(?:\d+|[A-Z])(?:[.)]|[^\S\r\n]*[-:])?[^\S\r\n]*/i, "")
      .trim();
    return {
      id: String(m[1]),
      label: /test/i.test(m[0]) ? `Test ${m[1]}` : /soru/i.test(m[0]) ? `Soru ${m[1]}` : `Gorev ${m[1]}`,
      title: m[0].trim(),
      body: body || block,
      domain: classifyTask(body || block),
    };
  }).filter((task) => task.body);
  const instructions = outputRequirementReport(text, parsedTasks);
  if (instructions.isInstructionList) {
    headingTasks.lastOutputRequirements = instructions.requirements;
    headingTasks.lastMainTask = instructions.mainTask;
    return [];
  }
  headingTasks.lastOutputRequirements = [];
  headingTasks.lastMainTask = null;
  const tasks = parsedTasks.filter((task) => isActualTaskBody(task.body, task.title));
  return tasks;
}

function questionTasks(text) {
  const raw = String(text || "").trim();
  if (!raw || headingTasks(raw).length) return [];
  const questionParts = raw
    .split(/(?<=[?？])\s+(?=[A-ZÇĞİÖŞÜ0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const mergedQuestionParts = [];
  for (const part of questionParts) {
    const wordCount = part.split(/\s+/).filter(Boolean).length;
    const looksLikeTaskStart = /^(?:test|soru|task|gorev|gÃ¶rev)\s*\d+\b/i.test(part) || /^\d+[.)]\s+/.test(part);
    if (mergedQuestionParts.length && wordCount < 3 && !looksLikeTaskStart) {
      mergedQuestionParts[mergedQuestionParts.length - 1] = `${mergedQuestionParts[mergedQuestionParts.length - 1]} ${part}`.trim();
    } else {
      mergedQuestionParts.push(part);
    }
  }
  if (mergedQuestionParts.length <= 1) return [];
  return mergedQuestionParts.map((body, i) => ({
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
  const label = lm ? lm[1].trim() : `Gorev ${i + 1}`;
  return { id: String(i + 1), label, title: label, body: b, domain: classifyTask(b) };
}

function bulletTasks(text) {
  const items = [];
  for (const ln of String(text || "").split(/\r?\n/)) {
    const m = ln.match(/^\s*[-*•–—]\s+(.+\S)\s*$/);
    if (m) items.push(m[1].trim());
  }
  if (items.length <= 1) return [];
  const parsedTasks = items.map((body, i) => mkTask(i, body));
  const instructions = outputRequirementReport(text, parsedTasks.map((task, i) => ({ ...task, title: items[i] })));
  if (instructions.isInstructionList) {
    bulletTasks.lastOutputRequirements = instructions.requirements;
    bulletTasks.lastMainTask = instructions.mainTask;
    return [];
  }
  bulletTasks.lastOutputRequirements = [];
  bulletTasks.lastMainTask = null;
  const tasks = parsedTasks.filter((task) => isActualTaskBody(task.body, task.title));
  return tasks;
}

function lineTasks(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  const looksTask = (l) => /\?\s*$/.test(l) || /^[\wÇĞİÖŞÜçğıöşü .]{1,24}:\s*\S/.test(l);
  const taskLines = lines.filter(looksTask);
  if (taskLines.length < 2 || taskLines.length !== lines.length) return [];
  return taskLines.map((body, i) => mkTask(i, body));
}

function decomposeTasks(input) {
  const text = String(input || "");
  headingTasks.lastOutputRequirements = [];
  headingTasks.lastMainTask = null;
  bulletTasks.lastOutputRequirements = [];
  bulletTasks.lastMainTask = null;
  let tasks = headingTasks(text);
  let outputRequirements = headingTasks.lastOutputRequirements || [];
  let mainTask = headingTasks.lastMainTask || null;
  if (tasks.length <= 1) tasks = bulletTasks(text);
  if (!outputRequirements.length) {
    outputRequirements = bulletTasks.lastOutputRequirements || [];
    mainTask = bulletTasks.lastMainTask || null;
  }
  if (tasks.length <= 1) tasks = questionTasks(text);
  if (tasks.length <= 1) tasks = lineTasks(text);
  const instructionOnly = !!outputRequirements.length && tasks.length <= 1;
  return {
    applicable: tasks.length > 1,
    count: instructionOnly ? 1 : tasks.length,
    tasks,
    outputRequirements,
    instructionOnly,
    mainTask,
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
      report.mainTask && report.mainTask.problem_text ? `MainTask.problem_text: ${report.mainTask.problem_text.replace(/\s+/g, " ").slice(0, 240)}` : "",
      ...report.outputRequirements.map((req) => `- ${req.label}: ${req.body.replace(/\s+/g, " ").slice(0, 180)}`),
    ].filter(Boolean).join("\n");
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
    const patterns = [label, `test ${id}`, `soru ${id}`, `gorev ${id}`, `${id}:`, `${id}.`];
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
  isInstructionItem,
  trFold,
};
