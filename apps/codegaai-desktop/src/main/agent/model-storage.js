"use strict";

const fs = require("node:fs");
const path = require("node:path");

function resolved(value) {
  return path.resolve(String(value || "").trim());
}

function validateMove(source, target) {
  const from = resolved(source);
  const to = resolved(target);
  if (!String(source || "").trim()) throw new Error("Mevcut model dizini bulunamadı.");
  if (!String(target || "").trim()) throw new Error("Hedef model dizini seçilmedi.");
  if (from === to) throw new Error("Hedef dizin mevcut model diziniyle aynı.");
  const relativeToTarget = path.relative(to, from);
  const relativeToSource = path.relative(from, to);
  if (relativeToSource && !relativeToSource.startsWith("..") && !path.isAbsolute(relativeToSource)) {
    throw new Error("Hedef dizin mevcut model dizininin içinde olamaz.");
  }
  if (relativeToTarget && !relativeToTarget.startsWith("..") && !path.isAbsolute(relativeToTarget)) {
    throw new Error("Mevcut model dizini hedef dizinin içinde olamaz.");
  }
  return { source: from, target: to };
}

async function directoryStats(root) {
  let files = 0;
  let bytes = 0;
  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const item = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(item);
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(item);
        files += 1;
        bytes += stat.size;
      }
    }
  }
  await walk(root);
  return { files, bytes };
}

async function moveModelStorage(source, target, options = {}) {
  const locations = validateMove(source, target);
  const notify = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const sourceStats = await directoryStats(locations.source);
  await fs.promises.mkdir(locations.target, { recursive: true });

  notify({ phase: "copying", message: "Model dosyaları yeni konuma kopyalanıyor.", ...sourceStats });
  await fs.promises.cp(locations.source, locations.target, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });

  notify({ phase: "verifying", message: "Kopyalanan model dosyaları doğrulanıyor.", ...sourceStats });
  const targetStats = await directoryStats(locations.target);
  if (sourceStats.files !== targetStats.files || sourceStats.bytes !== targetStats.bytes) {
    throw new Error(
      `Taşıma doğrulanamadı: kaynak ${sourceStats.files} dosya/${sourceStats.bytes} bayt, ` +
      `hedef ${targetStats.files} dosya/${targetStats.bytes} bayt. Eski dizin korunuyor.`
    );
  }

  if (options.removeSource !== false && fs.existsSync(locations.source)) {
    notify({ phase: "cleaning", message: "Doğrulanan eski model dosyaları temizleniyor.", ...sourceStats });
    await fs.promises.rm(locations.source, { recursive: true, force: true });
  }

  notify({ phase: "complete", message: "Model dizini başarıyla taşındı.", ...targetStats });
  return { ok: true, ...locations, ...targetStats };
}

module.exports = {
  directoryStats,
  moveModelStorage,
  validateMove,
};
