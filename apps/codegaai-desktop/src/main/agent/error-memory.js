"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function storePath() {
  if (process.env.CODEGA_ERROR_MEMORY_PATH) return process.env.CODEGA_ERROR_MEMORY_PATH;
  return path.join(os.homedir(), ".codega-ai", "cognitive-error-memory.json");
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), "utf8")) || {};
  } catch (_e) {
    return {};
  }
}

function save(data) {
  try {
    const p = storePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  } catch (_e) {
    /* memory write failure must not break chat */
  }
}

function normalizeKey(kind, detail) {
  return `${String(kind || "cognitive_error").slice(0, 80)}:${String(detail || "").slice(0, 140)}`;
}

function recordFailure(kind, detail = "") {
  if (!kind && !detail) return null;
  const data = load();
  const key = normalizeKey(kind, detail);
  const item = data[key] || { kind: String(kind || "cognitive_error"), detail: String(detail || ""), count: 0 };
  item.count += 1;
  item.lastSeen = Date.now();
  data[key] = item;
  save(data);
  return item;
}

function listFailures(limit = 8) {
  return Object.values(load())
    .sort((a, b) => (b.count - a.count) || (b.lastSeen - a.lastSeen))
    .slice(0, limit);
}

function correctiveRulesContext(limit = 6) {
  const items = listFailures(limit);
  if (!items.length) return "";
  const lines = ["## Cognitive Error Memory"];
  for (const item of items) {
    lines.push(`- Recurrent ${item.kind}: ${item.detail} (seen ${item.count}x). Add an explicit guard against this.`);
  }
  return lines.join("\n");
}

module.exports = {
  correctiveRulesContext,
  listFailures,
  recordFailure,
  storePath,
};
