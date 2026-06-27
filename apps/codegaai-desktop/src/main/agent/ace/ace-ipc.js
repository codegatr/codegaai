"use strict";
/**
 * ACE IPC — Artificial Cognition Engine IPC Handler Kayıt Modülü
 *
 * Kayıtlı kanallar:
 *   ace:dashboard          ()                         → dashboard
 *   ace:context            ({userId,topic,maxTokens}) → {context,layers,tokenEstimate}
 *   ace:process-message    ({message,userId})         → {message,resolved,refCtx}
 *   ace:project:activate   ({label,userId})           → ok
 *   ace:project:context    ({label})                  → string
 *   ace:project:add-arch   ({label,text})             → ok
 *   ace:project:add-todo   ({label,text})             → ok
 *   ace:project:resolve-todo ({label,id})             → ok
 *   ace:working:set-project  ({label})                → ok
 *   ace:working:set-mission  ({label})                → ok
 *   ace:working:set-task     ({task})                 → ok
 *   ace:working:add-decision ({decision,rationale})   → ok
 *   ace:working:snapshot     ()                       → snapshot
 *   ace:goal:add             ({title,description,category,priority,userId}) → goal
 *   ace:goal:list            ({userId})               → goal[]
 *   ace:goal:achieve         ({id})                   → goal
 *   ace:goal:summary         ({userId})               → summary
 *   ace:user:observe         ({userId,...})            → user
 *   ace:user:context         ({userId})               → string
 *   ace:user:summary         ()                       → summary
 *   ace:engineering:learn    ({type,title,description,tags}) → item
 *   ace:engineering:query    ({type,tag,minConfidence}) → items
 *   ace:engineering:summary  ()                       → summary
 *   ace:reflect              ({userId})               → reflection
 *   ace:life-graph:summary   ()                       → summary
 *   ace:life-graph:upsert-node ({id,type,label,data}) → node
 */

const { app, ipcMain } = require("electron");
const path = require("node:path");
const { initACEOS, getACEOS } = require("./ace-os");

let _initPromise = null;

function ok(data)  { return { ok: true, data }; }
function err(e)    { return { ok: false, error: String(e?.message || e) }; }

async function _ace() {
  await _initPromise;
  return getACEOS();
}

function registerACEIpc(generateFn) {
  if (!_initPromise) {
    const dataDir = path.join(app.getPath("userData"), "ace");
    _initPromise  = initACEOS(dataDir);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  ipcMain.handle("ace:dashboard", async () => {
    try { return ok((await _ace()).dashboard()); } catch(e) { return err(e); }
  });

  // ── Context Reconstruction ────────────────────────────────────────────────
  ipcMain.handle("ace:context", async (_e, opts={}) => {
    try { return ok((await _ace()).buildContext(opts)); } catch(e) { return err(e); }
  });

  ipcMain.handle("ace:process-message", async (_e, { message, userId="default" }={}) => {
    try { return ok((await _ace()).processIncoming(String(message||""), userId)); } catch(e) { return err(e); }
  });

  // ── Project ───────────────────────────────────────────────────────────────
  ipcMain.handle("ace:project:activate", async (_e, { label, userId="default" }={}) => {
    try { (await _ace()).activateProject(String(label||""), userId); return ok(true); } catch(e) { return err(e); }
  });

  ipcMain.handle("ace:project:context", async (_e, { label }={}) => {
    try { return ok((await _ace()).projectBrain.contextFor(String(label||""))); } catch(e) { return err(e); }
  });

  ipcMain.handle("ace:project:add-arch", async (_e, { label, text }={}) => {
    try { (await _ace()).projectBrain.addArchitecture(String(label||""), String(text||"")); return ok(true); } catch(e) { return err(e); }
  });

  ipcMain.handle("ace:project:add-todo", async (_e, { label, text }={}) => {
    try { (await _ace()).projectBrain.addOpenTodo(String(label||""), String(text||"")); return ok(true); } catch(e) { return err(e); }
  });

  ipcMain.handle("ace:project:resolve-todo", async (_e, { label, id }={}) => {
    try { (await _ace()).projectBrain.resolveTodo(String(label||""), String(id||"")); return ok(true); } catch(e) { return err(e); }
  });

  // ── Working Memory ────────────────────────────────────────────────────────
  ipcMain.handle("ace:working:set-project",  async (_e, { label }={}) => {
    try { (await _ace()).workingMemory.setProject(String(label||"")); return ok(true); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:working:set-mission",  async (_e, { label }={}) => {
    try { (await _ace()).workingMemory.setMission(String(label||"")); return ok(true); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:working:set-task",     async (_e, { task }={}) => {
    try { (await _ace()).workingMemory.setTask(String(task||"")); return ok(true); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:working:add-decision", async (_e, { decision, rationale="" }={}) => {
    try { (await _ace()).workingMemory.addDecision(String(decision||""), String(rationale||"")); return ok(true); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:working:snapshot",     async () => {
    try { return ok((await _ace()).workingMemory.snapshot()); } catch(e) { return err(e); }
  });

  // ── Goal Memory ───────────────────────────────────────────────────────────
  ipcMain.handle("ace:goal:add", async (_e, opts={}) => {
    try { return ok((await _ace()).goalMemory.add(opts)); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:goal:list", async (_e, { userId=null }={}) => {
    try { return ok((await _ace()).goalMemory.active(userId||null)); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:goal:achieve", async (_e, { id }={}) => {
    try { return ok((await _ace()).goalMemory.achieve(String(id||""))); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:goal:summary", async (_e, { userId=null }={}) => {
    try { return ok((await _ace()).goalMemory.summary(userId||null)); } catch(e) { return err(e); }
  });

  // ── User Brain ────────────────────────────────────────────────────────────
  ipcMain.handle("ace:user:observe", async (_e, { userId="default", ...rest }={}) => {
    try { return ok((await _ace()).userBrain.observe(userId, rest)); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:user:context", async (_e, { userId="default" }={}) => {
    try { return ok((await _ace()).userBrain.contextFor(userId)); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:user:summary", async () => {
    try { return ok((await _ace()).userBrain.summary()); } catch(e) { return err(e); }
  });

  // ── Engineering Brain ─────────────────────────────────────────────────────
  ipcMain.handle("ace:engineering:learn", async (_e, opts={}) => {
    try { return ok((await _ace()).engineeringBrain.learn(opts)); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:engineering:query", async (_e, opts={}) => {
    try { return ok((await _ace()).engineeringBrain.query(opts)); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:engineering:summary", async () => {
    try { return ok((await _ace()).engineeringBrain.summary()); } catch(e) { return err(e); }
  });

  // ── Self Reflection ───────────────────────────────────────────────────────
  ipcMain.handle("ace:reflect", async (_e, { userId="default" }={}) => {
    try {
      const reflection = await (await _ace()).endConversation({ userId, generateFn });
      return ok(reflection);
    } catch(e) { return err(e); }
  });

  // ── Life Graph ────────────────────────────────────────────────────────────
  ipcMain.handle("ace:life-graph:summary", async () => {
    try { return ok((await _ace()).lifeGraph.summary()); } catch(e) { return err(e); }
  });
  ipcMain.handle("ace:life-graph:upsert-node", async (_e, nodeData={}) => {
    try { return ok((await _ace()).lifeGraph.upsertNode(nodeData)); } catch(e) { return err(e); }
  });
}

module.exports = { registerACEIpc };
