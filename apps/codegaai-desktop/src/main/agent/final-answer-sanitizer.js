"use strict";
/**
 * Final Answer Sanitizer
 * ----------------------
 * Enforces two hard rules:
 * 1. Question text may never appear inside Final Answer.
 * 2. Final Answer must contain only answer material, not copied prompts.
 *
 * Task completeness is semantic and lives in SACV. This sanitizer deliberately
 * does not require labels like "Test 1" or exact wording.
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

function validateFinalAnswer(answer, question, taskReport = null) {
  const finalText = finalAnswerText(answer);
  const tasks = taskReport && taskReport.applicable ? taskReport.tasks : [];
  const errors = [];
  if (!finalText) errors.push("Final Answer section is missing.");
  const leak = questionLeakEvidence(question, finalText, tasks);
  if (leak) errors.push(`Question text leaked into Final Answer: ${leak}`);

  return {
    ok: errors.length === 0,
    finalText,
    errors,
    taskCounts: [],
    confidence: errors.length ? 0 : 100,
  };
}

function buildFinalAnswerRepairMessages(question, answer, taskReport, validation) {
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's Final Answer Sanitizer.",
        "Rewrite ONLY the final answer section.",
        "Hard rules:",
        "1. Question text may never appear inside Final Answer.",
        "2. Final Answer contains completed answer results only.",
        "Do not repeat problem statements. Do not include question wording. Task labels are optional, not required.",
        "Return a complete corrected response ending with Final Answer.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Detected final answer errors:\n${(validation.errors || []).join("\n")}`,
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
  trFold,
};
