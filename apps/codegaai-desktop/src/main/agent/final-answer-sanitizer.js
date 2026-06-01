"use strict";

/**
 * Final Answer Sanitizer
 * ----------------------
 * Hard output gate before the response reaches the user.
 *
 * Rules:
 * 1. Question text may never appear inside Final Answer.
 * 2. Final Answer must contain answer material only.
 * 3. Single-problem prompts may not contain phantom tasks, placeholders, or
 *    unrelated example/request-for-info sections.
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
  const matches = [...String(answer || "").matchAll(/Final Answer:\s*([\s\S]*?)(?=\n\s*(?:Anlama:|Islem:|İşlem:|Dogrulama:|Doğrulama:|Yorum:|Final Answer:)|$)/gi)];
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
  if (/[?？]/.test(finalText) && final.length > 35) return "question-mark-like final answer";
  return "";
}

function fakeTaskSplitEvidence(answer, taskReport) {
  if (!taskReport || !taskReport.instructionOnly || !(taskReport.outputRequirements || []).length) return "";
  const text = trFold(answer);
  const labels = [...text.matchAll(/(?:^|\n)\s*(?:\*\*)?\s*(?:gorev|task|soru)\s+\d+\s*(?:\*\*)?\s*[:\n]/g)];
  if (labels.length >= 2) return `${labels.length} fake task labels`;
  const final = trFold(finalAnswerText(answer));
  const finalLabels = [...final.matchAll(/\b(?:gorev|task|soru)\s+\d+\b/g)];
  if (finalLabels.length >= 2) return `${finalLabels.length} fake task labels in Final Answer`;
  return "";
}

function hasSecondQuestion(question, taskReport = null) {
  if (taskReport && taskReport.applicable && taskReport.count >= 2) return true;
  if (taskReport && !taskReport.applicable) return false;
  const q = trFold(question);
  if (!taskReport && !/\b(?:test|soru|gorev|task)\s*2\b/.test(q)) return false;
  if (/\b(?:test|soru|gorev|task)\s*2\b/.test(q)) return true;
  const questionMarks = (String(question || "").match(/[?？]/g) || []).length;
  return questionMarks >= 2;
}

function isSingleProblemMode(question, taskReport = null) {
  return !hasSecondQuestion(question, taskReport);
}

function phantomTaskDetector(answer, question, taskReport = null) {
  if (!isSingleProblemMode(question, taskReport)) return { ok: true, errors: [] };
  const text = trFold(answer);
  const labels = [...text.matchAll(/(?:^|\n|\b)(?:\*\*)?\s*(?:gorev|task|soru)\s+(\d+)\s*(?:\*\*)?\s*[:\n]/g)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  const phantom = labels.filter((n) => n >= 2);
  if (phantom.length) {
    return { ok: false, errors: [`phantom_task_detector: single-problem output contains phantom task labels: ${phantom.join(", ")}`] };
  }
  if (/\b(?:soru|gorev|task)\s+2\b/.test(text)) {
    return { ok: false, errors: ["phantom_task_detector: single-problem output contains Soru/Gorev/Task 2."] };
  }
  return { ok: true, errors: [] };
}

function emptyPlaceholderDetector(answer, question, taskReport = null) {
  if (!isSingleProblemMode(question, taskReport)) return { ok: true, errors: [] };
  const text = trFold(answer);
  const errors = [];
  if (/\bcevap\s*:\s*(?:\.{3}|…|\(\s*\.{3})/.test(text)) {
    errors.push("empty_placeholder_detector: placeholder answer detected.");
  }
  if (/lutfen\s+daha\s+fazla\s+bilgi|daha\s+fazla\s+ayrinti|bilgi\s+eksik|final\s+adiminizi\s+belirtin/.test(text)) {
    errors.push("empty_placeholder_detector: asks for more information despite a solvable single problem.");
  }
  return { ok: errors.length === 0, errors };
}

function unrelatedSectionDetector(answer, question, taskReport = null) {
  if (!isSingleProblemMode(question, taskReport)) return { ok: true, errors: [] };
  const text = trFold(answer);
  const q = trFold(question);
  if (/\bornek\s+cozum\b|\bexample\s+solution\b/.test(text) && !/\bornek|example/.test(q)) {
    return { ok: false, errors: ["unrelated_section_detector: unrelated example solution section detected."] };
  }
  return { ok: true, errors: [] };
}

function countProvidedTasks(question, taskReport = null) {
  if (taskReport && taskReport.applicable) return taskReport.count || 0;
  return isSingleProblemMode(question, taskReport) ? 1 : 2;
}

function countAnswerSections(answer) {
  const text = String(answer || "");
  const labels = [...text.matchAll(/(?:^|\n)\s*(?:\*\*)?\s*(?:soru|görev|gorev|task)\s+\d+\s*(?:\*\*)?\s*[:\n]/gi)];
  if (labels.length) return labels.length;
  return 1;
}

function sectionIsUntraceable(section, question, taskReport = null) {
  const s = trFold(section);
  if (/\b(?:soru|gorev|task)\s+([2-9]|\d{2,})\b/.test(s) && isSingleProblemMode(question, taskReport)) return true;
  if (/lutfen\s+(?:bir\s+)?gorev\s+belirtin|lutfen\s+daha\s+fazla\s+bilgi|daha\s+fazla\s+ayrinti|bilgi\s+eksik|yeni\s+gorev\s+belirtin/.test(s)) return true;
  if (/\bbaslatalim\b|\bornegin\b|\bornek\s+gorev\b|\bornek\s+cozum\b/.test(s) && !/\bornek|example/.test(trFold(question))) return true;
  if (/\bcevap\s*:\s*(?:\.{3}|…|\(\s*\.{3})/.test(s)) return true;
  return false;
}

function splitLabelSections(answer) {
  const text = String(answer || "");
  const re = /(?:^|\n)\s*(?:\*\*)?\s*(?:soru|görev|gorev|task)\s+\d+\s*(?:\*\*)?\s*[:\n]/gi;
  const matches = [...text.matchAll(re)];
  if (!matches.length) return [];
  return matches.map((m, i) => {
    const start = m.index + (m[0].startsWith("\n") ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    return text.slice(start, end).trim();
  }).filter(Boolean);
}

function cleanPhantomOutput(answer, question, taskReport = null) {
  const original = String(answer || "").trim();
  if (!original || !isSingleProblemMode(question, taskReport)) {
    return { changed: false, answer: original, removed: [], providedTaskCount: countProvidedTasks(question, taskReport), answerSectionCount: countAnswerSections(answer) };
  }

  const removed = [];
  let cleaned = original;
  const sections = splitLabelSections(original);
  if (sections.length > 1) {
    const kept = [];
    for (const section of sections) {
      if (sectionIsUntraceable(section, question, taskReport) || kept.length >= 1) removed.push(section);
      else kept.push(section);
    }
    if (kept.length) cleaned = kept.join("\n\n");
  }

  const lines = cleaned.split(/\r?\n/);
  const keptLines = [];
  let dropping = false;
  for (const line of lines) {
    const folded = trFold(line);
    if (/^\s*(?:\*\*)?\s*(?:soru|gorev|task)\s+([2-9]|\d{2,})\b/.test(folded)) {
      dropping = true;
      removed.push(line);
      continue;
    }
    if (dropping && /^\s*(?:\*\*)?\s*(?:soru|gorev|task)\s+1\b/.test(folded)) dropping = false;
    if (dropping) {
      removed.push(line);
      continue;
    }
    if (sectionIsUntraceable(line, question, taskReport)) {
      removed.push(line);
      continue;
    }
    keptLines.push(line);
  }
  cleaned = keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  cleaned = cleaned
    .replace(/^\s*(?:\*\*)?\s*(?:soru|g[Ã¶o]rev|task)\s+1\s*(?:\*\*)?\s*[:\-]?\s*/i, "")
    .trim();

  if (!/Final Answer:/i.test(cleaned)) {
    const final = finalAnswerText(original);
    if (final && !sectionIsUntraceable(final, question, taskReport)) cleaned = `${cleaned}\n\nFinal Answer: ${final}`.trim();
  }

  return {
    changed: cleaned !== original,
    answer: cleaned,
    removed,
    providedTaskCount: countProvidedTasks(question, taskReport),
    answerSectionCount: countAnswerSections(original),
  };
}

function validateFinalAnswer(answer, question, taskReport = null) {
  const cleaned = cleanPhantomOutput(answer, question, taskReport);
  const candidate = cleaned.changed ? cleaned.answer : answer;
  const finalText = finalAnswerText(candidate);
  const tasks = taskReport && taskReport.applicable ? taskReport.tasks : [];
  const errors = [];
  if (!finalText) errors.push("Final Answer section is missing.");
  const leak = questionLeakEvidence(question, finalText, tasks);
  if (leak) errors.push(`Question text leaked into Final Answer: ${leak}`);
  const fakeTasks = fakeTaskSplitEvidence(answer, taskReport);
  if (fakeTasks) errors.push(`Output instructions were incorrectly answered as separate tasks: ${fakeTasks}`);
  for (const detector of [
    phantomTaskDetector(candidate, question, taskReport),
    emptyPlaceholderDetector(candidate, question, taskReport),
    unrelatedSectionDetector(candidate, question, taskReport),
  ]) {
    errors.push(...detector.errors);
  }
  if (cleaned.answerSectionCount > cleaned.providedTaskCount && !cleaned.changed) {
    errors.push(`output_cleaner: answer section count ${cleaned.answerSectionCount} exceeds provided task count ${cleaned.providedTaskCount}.`);
  }

  return {
    ok: errors.length === 0,
    finalText,
    errors,
    taskCounts: [],
    cleanedAnswer: cleaned.changed ? cleaned.answer : "",
    cleaned,
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
        "3. For one-problem prompts, do not invent Soru/Gorev/Task 2, placeholder answers, example sections, or requests for more information.",
        "Do not repeat problem statements. Do not include question wording. Task labels are optional, not required.",
        taskReport && taskReport.instructionOnly
          ? "This request is ONE problem with output requirements. Do NOT write Gorev 1/Gorev 2/etc. Apply the required steps to the same problem."
          : "",
        "Return a complete corrected response ending with Final Answer.",
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: [
        `Detected final answer errors:\n${(validation.errors || []).join("\n")}`,
        taskReport && taskReport.instructionOnly
          ? `Output requirements:\n${(taskReport.outputRequirements || []).map((req) => `- ${req.body}`).join("\n")}`
          : "",
        `Original question:\n${question}`,
        `Previous answer:\n${answer}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

module.exports = {
  finalAnswerText,
  validateFinalAnswer,
  buildFinalAnswerRepairMessages,
  questionLeakEvidence,
  phantomTaskDetector,
  emptyPlaceholderDetector,
  unrelatedSectionDetector,
  cleanPhantomOutput,
  countAnswerSections,
  countProvidedTasks,
  trFold,
};
