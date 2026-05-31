"use strict";
/**
 * agent/logs.js
 * --------------
 * Basit kalıcı olay/hata günlüğü (Log Merkezi için). Halka tampon, en fazla 500 kayıt.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX = 500;

function storePath() {
  return process.env.CODEGA_LOGS_PATH || path.join(os.homedir(), ".codega-logs.json");
}
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return Array.isArray(d.items) ? d : { items: [] };
  } catch (_e) {
    return { items: [] };
  }
}
function save(d) {
  try { fs.writeFileSync(storePath(), JSON.stringify(d)); } catch (_e) {}
}

/** level: info|warn|error ; source: kısa etiket ; message: metin */
function add(level, source, message) {
  const d = load();
  d.items.push({
    ts: Date.now(),
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    source: String(source || "app").slice(0, 40),
    message: String(message == null ? "" : message).replace(/\s+/g, " ").slice(0, 500),
  });
  if (d.items.length > MAX) d.items = d.items.slice(-MAX);
  save(d);
}
const info = (s, m) => add("info", s, m);
const warn = (s, m) => add("warn", s, m);
const error = (s, m) => add("error", s, m);

function list(limit = 100) {
  return load().items.slice(-limit).reverse();
}
function clearAll() { save({ items: [] }); }

module.exports = { add, info, warn, error, list, clearAll, storePath };
