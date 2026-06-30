"use strict";

/**
 * aep-ipc.js — AEP IPC Handler Kayıt Modülü
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Kayıtlı kanallar:
 *   aep:dashboard          ()                        → CTO Dashboard
 *   aep:backlog:list       (opts?)                   → task[]
 *   aep:backlog:add        (opts)                    → task
 *   aep:backlog:update     (id, patch)               → task
 *   aep:backlog:summary    ()                        → summary
 *   aep:proposals:list     (opts?)                   → proposal[]
 *   aep:proposals:approve  (id)                      → proposal
 *   aep:proposals:reject   (id, reason)              → proposal
 *   aep:proposals:summary  ()                        → summary
 *   aep:patch:run          (proposalId)              → patchResult
 *   aep:score:latest       ()                        → scorecard
 *   aep:score:history      (n?)                      → scorecard[]
 *   aep:score:record       (opts)                    → scorecard
 *   aep:learning:summary   ()                        → summary
 *   aep:learning:query     (opts?)                   → entry[]
 *   aep:intel:analyze      ()                        → analysis
 *   aep:intel:summary      ()                        → summary
 *   aep:genome:latest      ()                        → genome entry
 *   aep:genome:report      ()                        → { text, entry }
 *   aep:cycle:run          (evolutionReport, version) → cycleResult
 *   aep:close-task         (taskId)                  → task
 *
 * Push kanallar:
 *   aep:cycle:start | aep:cycle:complete | aep:cycle:error
 *   aep:patch:start | aep:patch:pr_open  | aep:patch:failed | aep:patch:qa_blocked
 *   aep:genome:update
 */

const { app, ipcMain } = require("electron");
const path = require("node:path");
const { aepOS, initAEPOS } = require("./aep-os");

let _win         = null;
let _initPromise = null;

function registerAEPIpc(generateFn, githubConfig) {
  // Init
  if (!_initPromise) {
    const dataDir     = path.join(app.getPath("userData"), "aep");
    const projectRoot = path.join(__dirname, "..", "..", "..", "..");
    _initPromise = initAEPOS({ dataDir, projectRoot, generateFn, githubConfig });
    _initPromise.then(() => {
      // AEP event'lerini renderer'a yönlendir
      aepOS.on("cycle:start",    d => _push("aep:cycle:start",    d));
      aepOS.on("cycle:complete", d => _push("aep:cycle:complete", d));
      aepOS.on("cycle:error",    d => _push("aep:cycle:error",    d));
      aepOS.on("patch:start",    d => _push("aep:patch:start",    d));
      aepOS.on("patch:pr_open",  d => _push("aep:patch:pr_open",  d));
      aepOS.on("patch:failed",   d => _push("aep:patch:failed",   d));
      aepOS.on("patch:qa_blocked", d => _push("aep:patch:qa_blocked", d));
      aepOS.on("cycle:genome",   d => _push("aep:genome:update",  d));
    }).catch(e => console.warn("[AEP IPC] init:", e.message));
  }

  // ── Handler'lar ───────────────────────────────────────────────────────────

  ipcMain.handle("aep:dashboard", async () => {
    try { await _initPromise; return ok(aepOS.dashboard()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:backlog:list", async (_e, opts) => {
    try { await _initPromise; return ok(aepOS.backlog.list(opts || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:backlog:add", async (_e, opts) => {
    try { await _initPromise; return ok(aepOS.backlog.add(opts || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:backlog:update", async (_e, id, patch) => {
    try { await _initPromise; return ok(aepOS.backlog.update(String(id), patch || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:backlog:summary", async () => {
    try { await _initPromise; return ok(aepOS.backlog.summary()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:proposals:list", async (_e, opts) => {
    try { await _initPromise; return ok(aepOS.planner.listPrioritized(opts || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:proposals:approve", async (_e, id) => {
    try { await _initPromise; return ok(aepOS.approveProposal(String(id))); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:proposals:reject", async (_e, id, reason) => {
    try { await _initPromise; return ok(aepOS.rejectProposal(String(id), String(reason || ""))); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:proposals:summary", async () => {
    try { await _initPromise; return ok(aepOS.planner.summary()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:patch:run", async (_e, proposalId) => {
    try { await _initPromise; return ok(await aepOS.runPatch(String(proposalId))); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:score:latest", async () => {
    try { await _initPromise; return ok(aepOS.scorecard.latest()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:score:history", async (_e, n) => {
    try { await _initPromise; return ok(aepOS.scorecard.history(Number(n) || 10)); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:score:record", async (_e, opts) => {
    try { await _initPromise; return ok(aepOS.scorecard.record(opts || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:learning:summary", async () => {
    try { await _initPromise; return ok(aepOS.learning.summary()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:learning:query", async (_e, opts) => {
    try { await _initPromise; return ok(aepOS.learning.query(opts || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:intel:analyze", async () => {
    try { await _initPromise; return ok(aepOS.intel.analyze()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:intel:summary", async () => {
    try { await _initPromise; return ok(aepOS.intel.summary()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:genome:latest", async () => {
    try { await _initPromise; return ok(aepOS.genome.latest()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:genome:report", async () => {
    try { await _initPromise; return ok(aepOS.genome.report()); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:cycle:run", async (_e, evolutionReport, version) => {
    try {
      await _initPromise;
      return ok(await aepOS.runCycle(evolutionReport || null, String(version || "unknown")));
    } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:close-task", async (_e, taskId) => {
    try { await _initPromise; return ok(aepOS.closePRTask(String(taskId))); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:timeline:list", async (_e, opts) => {
    try { await _initPromise; return ok(aepOS.timeline.list(opts || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:timeline:add", async (_e, event) => {
    try { await _initPromise; return ok(aepOS.timeline.add(event || {})); } catch (e) { return err(e); }
  });

  ipcMain.handle("aep:timeline:summary", async () => {
    try { await _initPromise; return ok(aepOS.timeline.summary()); } catch (e) { return err(e); }
  });
}

function ok(data)  { return { ok: true,  data }; }
function err(e)    { return { ok: false, error: String(e?.message || e) }; }

function _push(channel, data) {
  try {
    const win = _win || require("electron").BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  } catch (_) {}
}

module.exports = { registerAEPIpc };
