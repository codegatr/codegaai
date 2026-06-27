"use strict";

/**
 * zip-ipc.js — ZIP Engine IPC handler kayıt modülü.
 *
 * Kayıtlı kanallar:
 *   zip:list    (zipPath)                          → dosya listesi
 *   zip:analyze (zipPath)                          → proje analizi + AI özeti
 *   zip:read    (zipPath, entryName)               → tek dosya içeriği (text)
 *   zip:extract (zipPath, destDir)                 → tüm arşivi klasöre aç
 *   zip:patch   (zipPath, destZip, patches)        → yamaları uygula ve yeni ZIP üret
 *   zip:create  (destZip, sourceDir)               → klasörden ZIP oluştur
 */

const path = require("node:path");
const os   = require("node:os");
const crypto = require("node:crypto");
const { ipcMain, dialog } = require("electron");
const zipEngine   = require("./zip-engine");
const zipAnalyzer = require("./zip-analyzer");

// Aktif oturumlar: token → { zipPath, analysis? }
const sessions = new Map();

function registerZipIpc() {
  /**
   * ZIP dosyasındaki tüm entry listesini döner.
   */
  ipcMain.handle("zip:list", async (_event, zipPath) => {
    try {
      const entries = await zipEngine.list(zipPath);
      return { ok: true, entries };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * ZIP arşivini analiz eder: stack, ağaç, özet.
   * Analiz önbelleğe alınır (aynı oturumda tekrar istenirse hızlı döner).
   */
  ipcMain.handle("zip:analyze", async (_event, zipPath) => {
    try {
      const analysis = await zipAnalyzer.analyzeZip(zipPath);
      // Oturum kaydı
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, { zipPath, analysis });
      // 30 dk sonra temizle
      setTimeout(() => sessions.delete(sessionId), 30 * 60 * 1000);
      return { ok: true, sessionId, analysis };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * ZIP içindeki text dosyasının içeriğini döner.
   */
  ipcMain.handle("zip:read", async (_event, zipPath, entryName) => {
    try {
      const content = await zipAnalyzer.readTextFile(zipPath, entryName);
      return { ok: true, content, entryName };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Tüm arşivi bir klasöre çıkarır.
   * destDir belirtilmezse sistem temp klasörü kullanılır.
   */
  ipcMain.handle("zip:extract", async (_event, zipPath, destDir) => {
    try {
      const target = destDir || path.join(os.tmpdir(), `codega_extract_${crypto.randomUUID()}`);
      await zipEngine.extract(zipPath, target);
      return { ok: true, destDir: target };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Mevcut ZIP'e yamalar uygulayarak yeni ZIP oluşturur.
   *
   * patches: Array<{
   *   action: 'add' | 'modify' | 'delete',
   *   name: string,           // ZIP içindeki yol
   *   content?: string        // add/modify için dosya içeriği
   * }>
   */
  ipcMain.handle("zip:patch", async (_event, zipPath, destZip, patches) => {
    try {
      await zipEngine.patch(zipPath, destZip, patches || []);
      return { ok: true, destZip };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Bir klasörden yeni ZIP arşivi oluşturur.
   */
  ipcMain.handle("zip:create", async (_event, sourceDir, destZip) => {
    try {
      const out = destZip || path.join(os.tmpdir(), `codega_pack_${crypto.randomUUID()}.zip`);
      await zipEngine.create(out, sourceDir);
      return { ok: true, destZip: out };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerZipIpc };
