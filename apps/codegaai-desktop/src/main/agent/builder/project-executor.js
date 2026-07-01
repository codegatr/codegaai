"use strict";

/**
 * project-executor.js — File System Executor + ZIP.
 *
 * Bir dosya listesini ({path, content}) güvenle diske yazar ve klasörü ZIP'ler.
 * "Bahane değil, iş": chat'in ürettiği kodları GERÇEKTEN teslim eder.
 *
 * Güvenlik: her dosya yolu path-guard ile workspace kökü içinde doğrulanır
 * (path traversal / symlink kaçış engellenir). Yazma atomik (tmp→rename).
 */

const fs   = require("node:fs");
const fsp  = require("node:fs/promises");
const path = require("node:path");
const { assertWithinRoot, PathSecurityError } = require("../indexer/path-guard");

function safeName(name, fallback) {
  const s = String(name || "").trim().replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || fallback;
}

async function atomicWrite(dest, content) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  const fd = await fsp.open(tmp, "w");
  try {
    await fd.writeFile(String(content), "utf8");
    try { await fd.sync(); } catch (_e) {}
  } finally {
    await fd.close();
  }
  await fsp.rename(tmp, dest);
}

/**
 * Dosyaları yaz + klasörü ZIP'le.
 * @param {object} o
 * @param {string} o.workspaceRoot  — yazma köküne izin verilen dizin (GÜVENLİ sınır)
 * @param {string} o.folder         — proje klasör adı (workspaceRoot altında)
 * @param {Array<{path:string,content:string}>} o.files
 * @param {string} [o.zipName]      — workspaceRoot altında ZIP adı (yoksa <folder>.zip)
 * @returns {Promise<{ok:boolean, dir:string, written:number, zipPath:string, skipped:string[]}>}
 */
async function executeProject(o = {}) {
  const workspaceRoot = String(o.workspaceRoot || "");
  if (!workspaceRoot) throw new Error("workspaceRoot zorunlu");
  const folder = safeName(o.folder, "codega-project");
  const files = Array.isArray(o.files) ? o.files : [];
  if (!files.length) throw new Error("Yazılacak dosya yok");

  await fsp.mkdir(workspaceRoot, { recursive: true });
  const targetDir = assertWithinRoot(workspaceRoot, folder); // kök içinde mi?

  const skipped = [];
  let written = 0;
  for (const f of files) {
    const rel = String(f && f.path || "").trim();
    if (!rel) { skipped.push("(boş yol)"); continue; }
    let dest;
    try {
      // Dosya, PROJE KLASÖRÜ içinde kalmalı (targetDir kökü).
      dest = assertWithinRoot(targetDir, rel);
    } catch (e) {
      skipped.push(`${rel} (${e instanceof PathSecurityError ? e.code : "reddedildi"})`);
      continue;
    }
    await atomicWrite(dest, f.content == null ? "" : f.content);
    written++;
  }

  if (!written) throw new Error("Hiçbir dosya yazılamadı (hepsi güvenlik nedeniyle reddedildi)");

  // ZIP: ÖNCE OS-native (zero-dependency: Compress-Archive / zip). Native yoksa
  // veya patlarsa güvenli archiver'a düş (regresyon olmasın).
  const zipName = safeName(o.zipName || `${folder}.zip`, `${folder}.zip`).replace(/(\.zip)?$/i, ".zip");
  const zipPath = path.join(workspaceRoot, zipName);
  let zipEngineUsed = "native";
  try {
    const { zipDirectory } = require("../../services/executor/native-zip");
    const r = await zipDirectory(targetDir, zipPath);
    zipEngineUsed = r.engine;
  } catch (nativeErr) {
    try {
      const zipEngine = require("../zip/zip-engine");
      await zipEngine.create(zipPath, targetDir);
      zipEngineUsed = "archiver-fallback";
    } catch (fallbackErr) {
      throw new Error(`ZIP oluşturulamadı (native: ${nativeErr.code || nativeErr.message}; fallback: ${fallbackErr.message || fallbackErr})`);
    }
  }

  return { ok: true, dir: targetDir, written, zipPath, zipName, skipped, zipEngine: zipEngineUsed };
}

module.exports = { executeProject, atomicWrite, safeName };
