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
}

module.exports = { registerBuilderIpc };
