"use strict";

/**
 * mission-ipc.js — MissionOS IPC Handler Kayıt Modülü
 *
 * Sprint 10: MissionOS
 *
 * Kayıtlı kanallar:
 *   mission:create          (intent, context?)          → mission (LLM plan)
 *   mission:create-manual   (opts)                      → mission (manuel)
 *   mission:list            (stateFilter?)              → mission[]
 *   mission:get             (id)                        → mission
 *   mission:execute         (id)                        → mission
 *   mission:approve         (id, reviewNote?)           → mission
 *   mission:release         (id, version)               → mission
 *   mission:cancel          (id)                        → mission
 *   mission:complete-task   (missionId, taskId, result) → mission
 *   mission:summary         ()                          → { total, byState, running }
 *   mission:events          (n?)                        → event[]
 *   mission:queue           (id)                        → { queue, stats }
 */

const { app, ipcMain } = require("electron");
const path = require("node:path");
const { initMissionOS, missionOS } = require("./mission-os");

let _win     = null;  // BrowserWindow referansı (push olayları için)
let _initPromise = null;

/**
 * MissionOS IPC handler'larını kaydet.
 * @param {BrowserWindow} win
 * @param {Function}      generateFn  — cloud-provider'dan LLM çağrısı
 */
function registerMissionIpc(win, generateFn) {
  _win = win;

  // Tek seferlik init
  if (!_initPromise) {
    const dataDir = path.join(app.getPath("userData"), "mission-os");
    _initPromise  = initMissionOS(dataDir);
  }

  // Executor olaylarını renderer'a push et
  missionOS.on("mission:created",  d => _push("mission:created",  d));
  missionOS.on("started",          d => _push("mission:started",  d));
  missionOS.on("review",           d => _push("mission:review",   d));
  missionOS.on("failed",           d => _push("mission:failed",   d));
  missionOS.on("cancelled",        d => _push("mission:cancelled", d));
  missionOS.on("progress",         d => _push("mission:progress", d));
  missionOS.on("task:started",     d => _push("mission:task:started",   d));
  missionOS.on("task:completed",   d => _push("mission:task:completed", d));
  missionOS.on("task:failed",      d => _push("mission:task:failed",    d));

  // ── Handler'lar ────────────────────────────────────────────────────────────

  ipcMain.handle("mission:create", async (_e, intent, context) => {
    try {
      await _initPromise;
      const mission = await missionOS.createMission(String(intent || ""), generateFn, context || {});
      return ok(mission);
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:create-manual", async (_e, opts) => {
    try {
      await _initPromise;
      const mission = await missionOS.createManualMission(opts || {});
      return ok(mission);
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:list", async (_e, stateFilter) => {
    try {
      await _initPromise;
      return ok(missionOS.listMissions(stateFilter || null));
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:get", async (_e, id) => {
    try {
      await _initPromise;
      const m = missionOS.getMission(String(id));
      return m ? ok(m) : err(new Error(`Mission bulunamadı: ${id}`));
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:execute", async (_e, id) => {
    try {
      await _initPromise;
      const mission = await missionOS.execute(String(id));
      return ok(mission);
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:approve", async (_e, id, reviewNote) => {
    try {
      await _initPromise;
      const mission = await missionOS.approve(String(id), reviewNote || {});
      return ok(mission);
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:release", async (_e, id, version) => {
    try {
      await _initPromise;
      const mission = await missionOS.release(String(id), String(version));
      return ok(mission);
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:cancel", async (_e, id) => {
    try {
      await _initPromise;
      const mission = await missionOS.cancel(String(id));
      return ok(mission);
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:complete-task", async (_e, missionId, taskId, result) => {
    try {
      await _initPromise;
      const mission = await missionOS.completeTask(String(missionId), String(taskId), result);
      return ok(mission);
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:summary", async () => {
    try {
      await _initPromise;
      return ok(missionOS.summary());
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:events", async (_e, n) => {
    try {
      await _initPromise;
      return ok(await missionOS.recentEvents(Number(n) || 50));
    } catch (e) { return err(e); }
  });

  ipcMain.handle("mission:queue", async (_e, id) => {
    try {
      await _initPromise;
      return ok(missionOS.getExecutionQueue(String(id)));
    } catch (e) { return err(e); }
  });
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function ok(data)   { return { ok: true,  data }; }
function err(e)     { return { ok: false, error: String(e?.message || e) }; }

function _push(channel, data) {
  try {
    const win = _win || require("electron").BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  } catch (_) {}
}

module.exports = { registerMissionIpc };
