"use strict";

/**
 * jsonl-chunk-store.js — Satır-bazlı (JSONL) chunk store.
 *
 * Her kayıt tek satır JSON. Append-only (büyük store'u RAM'e almadan büyür).
 * Okuyucu satır satır parse eder: BOZUK BİR SATIR tüm store'u çökertmez —
 * atlanır ve sayılır. UTF-8 güvenli.
 */

const fs   = require("node:fs");
const path = require("node:path");

function appendRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(record) + "\n";
  // 'a' (O_APPEND) — küçük satır yazımı atomik kabul edilir; eşzamanlı
  // yazıcılar satırları araya karıştırmaz.
  const fd = fs.openSync(filePath, "a");
  try {
    fs.writeFileSync(fd, line, "utf8");
    try { fs.fsyncSync(fd); } catch (_e) {}
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true };
}

function appendMany(filePath, records) {
  if (!Array.isArray(records) || !records.length) return { ok: true, written: 0 };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const buf = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const fd = fs.openSync(filePath, "a");
  try {
    fs.writeFileSync(fd, buf, "utf8");
    try { fs.fsyncSync(fd); } catch (_e) {}
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true, written: records.length };
}

/**
 * Tüm kayıtları oku — bozuk satırları ATLA, sağlamları döndür.
 * @returns {{records:any[], skipped:number, total:number, corruptLines:number[]}}
 */
function readAll(filePath) {
  let raw = "";
  try { raw = fs.readFileSync(filePath, "utf8"); }
  catch (e) {
    if (e && e.code === "ENOENT") return { records: [], skipped: 0, total: 0, corruptLines: [] };
    throw e;
  }
  const lines = raw.split(/\r?\n/);
  const records = [];
  const corruptLines = [];
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    total++;
    try {
      records.push(JSON.parse(line));
    } catch (_e) {
      corruptLines.push(i + 1); // bozuk satır numarası — store çökmez
    }
  }
  return { records, skipped: corruptLines.length, total, corruptLines };
}

/**
 * Bozuk satırları atıp dosyayı yeniden yaz (compaction). Atomik: tmp+rename.
 * @returns {{ok:boolean, kept:number, removed:number}}
 */
function compact(filePath) {
  const { records, skipped } = readAll(filePath);
  const tmp = `${filePath}.tmp`;
  const buf = records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, buf, "utf8");
    try { fs.fsyncSync(fd); } catch (_e) {}
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
  return { ok: true, kept: records.length, removed: skipped };
}

module.exports = { appendRecord, appendMany, readAll, compact };
