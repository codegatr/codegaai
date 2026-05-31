"use strict";
/**
 * agent/learning-store.js
 * ------------------------
 * Sürekli öğrenmeyle toplanan bilgi notlarını kalıcı tutar (kişisel hafızadan ayrı).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX_NOTES = 300;

function storePath() {
  if (process.env.CODEGA_LEARNING_PATH) return process.env.CODEGA_LEARNING_PATH;
  return path.join(os.homedir(), ".codega-learning.json");
}

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return Array.isArray(d.notes) ? d : { notes: [] };
  } catch (_e) {
    return { notes: [] };
  }
}
function save(d) {
  try { fs.writeFileSync(storePath(), JSON.stringify(d, null, 2)); } catch (_e) {}
}

function keyOf(n) {
  return `${n.source}|${n.topic}|${String(n.text).slice(0, 60)}`.toLowerCase();
}

/** Yeni notları ekle (tekrarları atla). Eklenen sayısını döndürür. */
function addNotes(notes) {
  const d = load();
  const seen = new Set(d.notes.map(keyOf));
  let added = 0;
  for (const n of notes || []) {
    const k = keyOf(n);
    if (seen.has(k)) continue;
    seen.add(k);
    d.notes.push(n);
    added += 1;
  }
  if (d.notes.length > MAX_NOTES) d.notes = d.notes.slice(-MAX_NOTES);
  if (added) save(d);
  return added;
}

function list(limit = 50) {
  return load().notes.slice(-limit).reverse();
}
function count() {
  return load().notes.length;
}
function clearAll() {
  save({ notes: [] });
}

module.exports = { addNotes, list, count, clearAll, storePath };
