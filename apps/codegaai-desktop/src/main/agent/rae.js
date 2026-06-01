"use strict";
/**
 * Response Assembly Engine (RAE)
 * ------------------------------
 * Final deterministic assembly layer. It turns verified stage fragments into a
 * single clean user response: one explanation set, no duplicated Final Answer,
 * no duplicated human interpretation, and no raw engine labels leaking through.
 */

const { finalAnswerText, trFold } = require("./final-answer-sanitizer");

const SECTION_NAMES = [
  "Anlama",
  "İşlem",
  "Islem",
  "Doğrulama",
  "Dogrulama",
  "Yorum",
  "İnsan Yorumu",
  "Insan Yorumu",
  "Final Answer",
];

function sectionRegex(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped}:\\s*([\\s\\S]*?)(?=\\n(?:${SECTION_NAMES.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}):|$)`, "gi");
}

function extractSections(text, name) {
  const matches = [];
  const re = sectionRegex(name);
  let m;
  while ((m = re.exec(String(text || "")))) {
    const value = String(m[1] || "").trim();
    if (value) matches.push(value);
  }
  return matches;
}

function lastSection(text, names) {
  for (const name of names) {
    const values = extractSections(text, name);
    if (values.length) return values[values.length - 1];
  }
  return "";
}

function cleanEnginePrefixes(text) {
  return String(text || "")
    .replace(/\bMLVC\s+([a-z_-]+):\s*/gi, "")
    .replace(/\bRPRE\s+([a-z_-]+):\s*/gi, "")
    .replace(/\bEBSE\s+([a-z_-]+):\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLines(text) {
  const seen = new Set();
  const lines = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    const key = trFold(line).replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(raw.trimEnd());
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function shouldKeepTrapLine(question, line) {
  const foldedLine = trFold(line);
  if (!/tuzak|trap/.test(foldedLine)) return true;
  const q = trFold(question);
  if (/haric|except/.test(foldedLine)) return /haric|except/.test(q);
  if (/gec|sira|yarista/.test(foldedLine)) return /gec|sira|yarista/.test(q);
  return true;
}

function cleanReasoning(question, text) {
  return normalizeLines(cleanEnginePrefixes(text)
    .split(/\r?\n/)
    .filter((line) => shouldKeepTrapLine(question, line))
    .join("\n"));
}

function compact(text) {
  return trFold(text).replace(/\s+/g, " ").trim();
}

function mergeCommentary(yorum, human) {
  const y = String(yorum || "").trim();
  const h = String(human || "").replace(/^\s*-\s*/gm, "").trim();
  if (!h) return y;
  if (!y) return h;
  const cy = compact(y);
  const ch = compact(h);
  if (cy.includes(ch) || ch.includes(cy)) return y.length >= h.length ? y : h;
  return `${y}\n${h}`;
}

function assembleResponse(question, answer, taskRegistry = null) {
  const original = String(answer || "").trim();
  if (!original) return { changed: false, answer: original, confidence: 100 };

  const registryFinal = taskRegistry && taskRegistry.isComplete && taskRegistry.isComplete()
    ? taskRegistry.toFinalAnswerString()
    : "";
  const final = registryFinal || finalAnswerText(original) || lastSection(original, ["Final Answer"]);
  if (!final) return { changed: false, answer: original, confidence: 100 };

  const anlama = cleanReasoning(question, lastSection(original, ["Anlama"]));
  const islem = cleanReasoning(question, lastSection(original, ["İşlem", "Islem"]));
  const dogrulama = cleanReasoning(question, lastSection(original, ["Doğrulama", "Dogrulama"]));
  const yorum = mergeCommentary(
    cleanReasoning(question, lastSection(original, ["Yorum"])),
    cleanReasoning(question, lastSection(original, ["İnsan Yorumu", "Insan Yorumu"]))
  );

  const parts = [];
  if (anlama) parts.push("Anlama:", anlama, "");
  if (islem) parts.push("İşlem:", islem, "");
  if (dogrulama) parts.push("Doğrulama:", dogrulama, "");
  if (yorum) parts.push("Yorum:", yorum, "");
  parts.push(`Final Answer: ${final.trim()}`);

  const assembled = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    changed: assembled !== original,
    answer: assembled,
    confidence: 100,
  };
}

module.exports = {
  assembleResponse,
  cleanEnginePrefixes,
  extractSections,
  mergeCommentary,
};
