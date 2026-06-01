"use strict";
/**
 * Final Answer Sanitizer
 * ----------------------
 * Enforces two hard rules:
 * 1. Question text may never appear inside Final Answer.
 * 2. Every detected task must produce exactly one verified answer.
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

function finalAnswerText(answer) {
  const matches = [...String(answer || "").matchAll(/Final Answer:\s*([\s\S]*?)(?=\n\s*(?:Anlama:|İşlem:|Islem:|Doğrulama:|Dogrulama:|Yorum:|Final Answer:)|$)/gi)];
  if (!matches.length) return "";
  return matches[matches.length - 1][1].trim();
}

function compact(text) {
  return trFold(text).replace(/\s+/g, " ").trim();
}

function questionLeakEvidence(question, finalText, tasks = []) {
  const final = compact(finalText);
  if (!final) return "";
  const candidates = [];
  const addCandidate = (value) => {
    const clean = compact(value);
    if (clean.length >= 35) candidates.push(clean);
  };
  addCandidate(question);
  for (const task of tasks || []) {
    addCandidate(task.body);
    for (const line of String(task.body || "").split(/\r?\n/)) addCandidate(line);
  }
  const leaked = candidates.find((candidate) => final.includes(candidate.slice(0, Math.min(candidate.length, 120))));
  if (leaked) return leaked.slice(0, 120);
  if (/[?؟]/.test(finalText) && final.length > 35) return "question-mark-like final answer";
  return "";
}

function countPattern(text, pattern) {
  const haystack = compact(text);
  const escaped = compact(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return 0;
  const re = new RegExp(`(^|\\b)${escaped}(\\b|\\s*:)`, "g");
  return [...haystack.matchAll(re)].length;
}

function countTaskAnswerOccurrences(text, task) {
  const labelCount = countPattern(text, task.label);
  if (labelCount > 0) return labelCount;
  const id = String(task.id || "").trim();
  const alternatives = [`test ${id}`, `soru ${id}`, `gorev ${id}`, `${id}:`].filter(Boolean);
  return Math.max(0, ...alternatives.map((pattern) => countPattern(text, pattern)));
}

function taskLabelPatterns(task) {
  const id = String(task.id || "").trim();
  const label = String(task.label || "").trim();
  return [
    label,
    id ? `test ${id}` : "",
    id ? `soru ${id}` : "",
    id ? `gorev ${id}` : "",
    id ? `${id}:` : "",
  ];
}

function validateFinalAnswer(answer, question, taskReport = null) {
  const finalText = finalAnswerText(answer);
  const tasks = taskReport && taskReport.applicable ? taskReport.tasks : [];
  const errors = [];
  if (!finalText) errors.push("Final Answer section is missing.");
  const leak = questionLeakEvidence(question, finalText, tasks);
  if (leak) errors.push(`Question text leaked into Final Answer: ${leak}`);

  const taskCounts = [];
  if (tasks.length) {
    for (const task of tasks) {
      const count = countTaskAnswerOccurrences(finalText, task);
      taskCounts.push({ task, count });
      if (count !== 1) errors.push(`${task.label} must appear exactly once in Final Answer; found ${count}.`);
    }
  }

  return {
    ok: errors.length === 0,
    finalText,
    errors,
    taskCounts,
    confidence: errors.length ? 0 : 100,
  };
}

function buildFinalAnswerRepairMessages(question, answer, taskReport, validation) {
  const taskLines = taskReport && taskReport.applicable
    ? taskReport.tasks.map((task) => `- ${task.label}: answer with exactly one concise result`).join("\n")
    : "- Provide exactly one concise final result.";
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Final Answer Sanitizer.",
        "Rewrite ONLY the final answer section.",
        "Hard rules:",
        "1. Question text may never appear inside Final Answer.",
        "2. Every detected task must produce exactly one verified answer.",
        "Do not repeat problem statements. Do not include question wording. Use concise result labels.",
        "Return a complete corrected response ending with Final Answer.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Detected final answer errors:\n${(validation.errors || []).join("\n")}`,
        `Required final answer shape:\n${taskLines}`,
        `Original question:\n${question}`,
        `Previous answer:\n${answer}`,
      ].join("\n\n"),
    },
  ];
}

module.exports = {
  finalAnswerText,
  validateFinalAnswer,
  buildFinalAnswerRepairMessages,
  questionLeakEvidence,
  countTaskAnswerOccurrences,
  trFold,
};
