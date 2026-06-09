"use strict";

const fs = require("node:fs");
const os = require("node:os");
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

function defaultOllamaModelPath(platform = process.platform, home = os.homedir()) {
  if (platform === "win32" || platform === "darwin" || platform === "linux") {
    return path.join(home, ".ollama", "models");
  }
  return path.join(home, ".ollama", "models");
}

function uniquePaths(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => path.resolve(value))
    .filter((value) => {
      const key = process.platform === "win32" ? value.toLowerCase() : value;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function inspectModelStorage(candidate) {
  const stats = await directoryStats(candidate.path);
  const hasLayout = fs.existsSync(path.join(candidate.path, "blobs")) ||
    fs.existsSync(path.join(candidate.path, "manifests"));
  return {
    ...candidate,
    path: path.resolve(candidate.path),
    exists: fs.existsSync(candidate.path),
    hasLayout,
    ...stats,
  };
}

async function discoverModelStorage(options = {}) {
  const candidates = uniquePaths([
    options.configuredPath,
    options.environmentPath,
    defaultOllamaModelPath(options.platform, options.home),
    options.codegaDefaultPath,
  ]).map((candidatePath) => {
    const configured = String(options.configuredPath || "").trim();
    const environment = String(options.environmentPath || "").trim();
    const defaultPath = defaultOllamaModelPath(options.platform, options.home);
    return {
      path: candidatePath,
      source: configured && path.resolve(configured) === candidatePath
        ? "configured"
        : environment && path.resolve(environment) === candidatePath
          ? "environment"
          : path.resolve(defaultPath) === candidatePath
            ? "ollama-default"
            : "codega-default",
    };
  });
  const inspected = [];
  for (const candidate of candidates) inspected.push(await inspectModelStorage(candidate));
  const selected = inspected.find((candidate) => candidate.files > 0 && candidate.hasLayout) ||
    inspected.find((candidate) => candidate.files > 0) ||
    inspected.find((candidate) => candidate.source === "configured") ||
    inspected.find((candidate) => candidate.source === "environment") ||
    inspected.find((candidate) => candidate.source === "ollama-default") ||
    inspected[0];
  return { ...(selected || {}), candidates: inspected };
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
  defaultOllamaModelPath,
  discoverModelStorage,
  inspectModelStorage,
  moveModelStorage,
  validateMove,
};
