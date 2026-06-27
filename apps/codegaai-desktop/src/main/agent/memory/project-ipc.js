"use strict";

/**
 * project-ipc.js — Proje Hafızası IPC handler kayıt modülü.
 *
 * Kayıtlı kanallar:
 *   project-memory:list           ()                           → proje listesi
 *   project-memory:create         (name, opts?)                → yeni proje
 *   project-memory:get            (id)                         → proje detayı (brain dahil)
 *   project-memory:update-meta    (id, patch)                  → meta güncelle
 *   project-memory:delete         (id)                         → projeyi sil
 *   project-memory:append         (id, category, entry)        → brain'e giriş ekle
 *   project-memory:remove-entry   (id, category, index)        → giriş sil
 *   project-memory:replace-cat    (id, category, entries)      → kategori toplu güncelle
 *   project-memory:search         (id, query)                  → proje içinde ara
 *   project-memory:search-all     (query)                      → tüm projelerde ara
 *   project-memory:detect         (hints)                      → auto tespit veya oluştur
 *   project-memory:context        (id, maxPerCategory?)        → AI bağlam özeti
 *   project-memory:categories     ()                           → kategori listesi
 */

const path = require("node:path");
const { app, ipcMain } = require("electron");
const { ProjectStore } = require("./project-store");
const { ProjectEngine, CATEGORY_LABELS } = require("./project-engine");

let _engine = null;

function getEngine() {
  if (!_engine) {
    const dir = path.join(app.getPath("userData"), "project-memories");
    _engine = new ProjectEngine(new ProjectStore(dir));
  }
  return _engine;
}

function ok(data)  { return { ok: true,  ...data }; }
function err(e)    { return { ok: false, error: String(e?.message || e) }; }

function registerProjectMemoryIpc() {
  const e = getEngine();

  // ── Liste
  ipcMain.handle("project-memory:list", async () => {
    try   { return ok({ projects: await e.list() }); }
    catch (ex) { return err(ex); }
  });

  // ── Oluştur
  ipcMain.handle("project-memory:create", async (_ev, name, opts = {}) => {
    try   { return ok({ project: await e.create(name, opts) }); }
    catch (ex) { return err(ex); }
  });

  // ── Getir
  ipcMain.handle("project-memory:get", async (_ev, id) => {
    try   { return ok({ project: await e.get(id) }); }
    catch (ex) { return err(ex); }
  });

  // ── Meta güncelle
  ipcMain.handle("project-memory:update-meta", async (_ev, id, patch) => {
    try   { return ok({ project: await e.updateMeta(id, patch) }); }
    catch (ex) { return err(ex); }
  });

  // ── Sil
  ipcMain.handle("project-memory:delete", async (_ev, id) => {
    try   { return ok({ deleted: await e.delete(id) }); }
    catch (ex) { return err(ex); }
  });

  // ── Brain: Giriş ekle
  ipcMain.handle("project-memory:append", async (_ev, id, category, entry) => {
    try   { return ok({ project: await e.append(id, category, entry) }); }
    catch (ex) { return err(ex); }
  });

  // ── Brain: Giriş sil
  ipcMain.handle("project-memory:remove-entry", async (_ev, id, category, index) => {
    try   { return ok({ project: await e.removeEntry(id, category, Number(index)) }); }
    catch (ex) { return err(ex); }
  });

  // ── Brain: Kategoriyi toplu güncelle
  ipcMain.handle("project-memory:replace-cat", async (_ev, id, category, entries) => {
    try   { return ok({ project: await e.replaceBrainCategory(id, category, entries) }); }
    catch (ex) { return err(ex); }
  });

  // ── Proje içi arama
  ipcMain.handle("project-memory:search", async (_ev, id, query) => {
    try   { return ok({ results: await e.search(id, query) }); }
    catch (ex) { return err(ex); }
  });

  // ── Tüm projelerde arama
  ipcMain.handle("project-memory:search-all", async (_ev, query) => {
    try   { return ok({ results: await e.searchAll(query) }); }
    catch (ex) { return err(ex); }
  });

  // ── Auto tespit / oluştur
  ipcMain.handle("project-memory:detect", async (_ev, hints) => {
    try   { return ok({ project: await e.detectOrCreate(hints || {}) }); }
    catch (ex) { return err(ex); }
  });

  // ── AI bağlam özeti
  ipcMain.handle("project-memory:context", async (_ev, id, maxPerCategory = 5) => {
    try   { return ok({ context: await e.buildContext(id, Number(maxPerCategory) || 5) }); }
    catch (ex) { return err(ex); }
  });

  // ── Kategori listesi (UI için)
  ipcMain.handle("project-memory:categories", () => {
    return ok({
      categories: Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label })),
    });
  });
}

module.exports = { registerProjectMemoryIpc };
