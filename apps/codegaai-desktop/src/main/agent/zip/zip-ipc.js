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
const fs   = require("node:fs/promises");
const crypto = require("node:crypto");
const { ipcMain, dialog, BrowserWindow } = require("electron");
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

  /**
   * Chat içi "üretilen projeyi ZIP indir": renderer'dan gelen { name, content }
   * dosya listesini güvenli adlarla temp klasöre yazar, save dialog ile seçilen
   * yola ZIP'ler. Disk dışından okuma yok; entry adları assertSafeEntryName ile
   * doğrulanır (path traversal/absolute reddi).
   * payload: { files: Array<{ name, content }>, defaultName? }
   */
  ipcMain.handle("zip:save-files", async (event, payload = {}) => {
    let tmpDir = "";
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const files = Array.isArray(payload.files) ? payload.files : [];
      if (!files.length) return { ok: false, error: "Kaydedilecek dosya bulunamadı." };

      const saved = await dialog.showSaveDialog(win, {
        title: "Üretilen projeyi ZIP olarak kaydet",
        defaultPath: String(payload.defaultName || "codega-proje").replace(/[^\w.\-]+/g, "_") + ".zip",
        filters: [{ name: "ZIP arşivi", extensions: ["zip"] }],
      });
      if (saved.canceled || !saved.filePath) return { ok: false, canceled: true };

      tmpDir = path.join(os.tmpdir(), `codega_pack_${crypto.randomUUID()}`);
      await fs.mkdir(tmpDir, { recursive: true });
      let written = 0;
      for (const f of files) {
        const safe = zipEngine._assertSafeEntryName(f && f.name);
        const dest = path.join(tmpDir, safe);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, String((f && f.content) || ""), "utf8");
        written++;
      }
      await zipEngine.create(saved.filePath, tmpDir);
      return { ok: true, destZip: saved.filePath, files: written };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (tmpDir) { try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch (_e) {} }
    }
  });

  /**
   * Güvenli proje export'u: workspace klasörünü level-9 ZIP olarak diske yazar.
   * opts: { sourceDir?, destZip?, manifest?, projectSignature?, version? }
   */
  ipcMain.handle("zip:export-project", async (event, opts = {}) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      let sourceDir = String(opts.sourceDir || "").trim();
      if (!sourceDir) {
        const picked = await dialog.showOpenDialog(win, {
          title: "ZIP olarak dışa aktarılacak proje klasörünü seç",
          properties: ["openDirectory"],
        });
        if (picked.canceled || !picked.filePaths?.[0]) return { ok: false, canceled: true };
        sourceDir = picked.filePaths[0];
      }

      let destZip = String(opts.destZip || "").trim();
      if (!destZip) {
        const saved = await dialog.showSaveDialog(win, {
          title: "Proje ZIP arşivini kaydet",
          defaultPath: `${path.basename(sourceDir)}.zip`,
          filters: [{ name: "ZIP arşivi", extensions: ["zip"] }],
        });
        if (saved.canceled || !saved.filePath) return { ok: false, canceled: true };
        destZip = saved.filePath;
      }

      const result = await zipEngine.createProjectArchive(sourceDir, destZip, opts);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Güvenli proje import'u: ZIP'i temp'e açar, manifest doğrular, sonra workspace'e işler.
   * opts: { zipPath?, workspaceDir?, projectSignature?, version? }
   */
  ipcMain.handle("zip:import-project", async (event, opts = {}) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      let zipPath = String(opts.zipPath || "").trim();
      if (!zipPath) {
        const picked = await dialog.showOpenDialog(win, {
          title: "İçe aktarılacak proje ZIP arşivini seç",
          properties: ["openFile"],
          filters: [{ name: "ZIP arşivi", extensions: ["zip"] }],
        });
        if (picked.canceled || !picked.filePaths?.[0]) return { ok: false, canceled: true };
        zipPath = picked.filePaths[0];
      }

      let workspaceDir = String(opts.workspaceDir || "").trim();
      if (!workspaceDir) {
        const picked = await dialog.showOpenDialog(win, {
          title: "Projenin içe aktarılacağı workspace klasörünü seç",
          properties: ["openDirectory", "createDirectory"],
        });
        if (picked.canceled || !picked.filePaths?.[0]) return { ok: false, canceled: true };
        workspaceDir = picked.filePaths[0];
      }

      const result = await zipEngine.importProjectArchive(zipPath, workspaceDir, opts);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerZipIpc };
