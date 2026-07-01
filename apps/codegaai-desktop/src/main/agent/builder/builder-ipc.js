"use strict";

/**
 * builder-ipc.js — CODEGA AI Builder Engine IPC Channels
 *
 * Kanallar:
 *   builder:stacks   — desteklenen stack listesini döner
 *   builder:build    — proje üretir, ZIP dosyası döner
 *   builder:preview  — dosya ağacını önizler (ZIP oluşturmaz)
 */

const { ipcMain, app } = require("electron");
const path = require("node:path");
const { build, preview, STACKS } = require("./builder-engine");
const { parseProjectRequest } = require("./builder-spec");

let _outputDir = null;

function getOutputDir() {
  if (!_outputDir) {
    _outputDir = path.join(app.getPath("userData"), "builder-output");
  }
  return _outputDir;
}

function registerBuilderIpc() {
  // ── builder:stacks ──────────────────────────────────────────
  ipcMain.handle("builder:stacks", async () => {
    return Object.entries(STACKS).map(([id, s]) => ({
      id,
      label:       s.label,
      description: s.description,
      language:    s.language,
      defaultDb:   s.defaultDb,
      databases:   s.databases,
      features:    s.features,
    }));
  });

  // ── builder:build ───────────────────────────────────────────
  ipcMain.handle("builder:build", async (_event, spec) => {
    if (!spec || typeof spec !== "object") throw new Error("Geçersiz proje spesifikasyonu");
    const result = await build(spec, getOutputDir());
    return result; // { outPath, fileName, stack, name, fileCount, files }
  });

  // ── builder:preview ─────────────────────────────────────────
  ipcMain.handle("builder:preview", async (_event, spec) => {
    if (!spec || typeof spec !== "object") throw new Error("Geçersiz proje spesifikasyonu");
    return preview(spec); // { stack, name, fileCount, files: string[] }
  });

  // ── builder:build-from-prompt ───────────────────────────────
  // Tek prompt → domain entity'leri çıkar → entity-güdümlü proje + ZIP.
  ipcMain.handle("builder:build-from-prompt", async (_event, payload) => {
    const prompt = typeof payload === "string" ? payload : (payload && payload.prompt);
    if (!prompt || !String(prompt).trim()) throw new Error("Proje isteği (prompt) boş olamaz");
    const opts = (payload && typeof payload === "object" && payload.opts) || {};
    const spec = parseProjectRequest(String(prompt), opts);
    const result = await build(spec, getOutputDir());
    return { ...result, spec: { name: spec.name, type: spec.type, database: spec.database, entities: spec.entities.map((e) => e.model), features: spec.features } };
  });

  // ── builder:plan-from-prompt ────────────────────────────────
  // ZIP üretmeden yalnız spec'i döndür (önizleme/onay için).
  ipcMain.handle("builder:plan-from-prompt", async (_event, payload) => {
    const prompt = typeof payload === "string" ? payload : (payload && payload.prompt);
    if (!prompt || !String(prompt).trim()) throw new Error("Proje isteği (prompt) boş olamaz");
    const opts = (payload && typeof payload === "object" && payload.opts) || {};
    return parseProjectRequest(String(prompt), opts);
  });
}

module.exports = { registerBuilderIpc };
