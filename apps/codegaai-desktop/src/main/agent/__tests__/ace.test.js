"use strict";
const path = require("node:path");
const os   = require("node:os");
const fs   = require("node:fs");

// ── cognitive-types ──────────────────────────────────────────────────────────
const { COGNITIVE_LAYER, NODE_TYPE, EDGE_TYPE, CONTEXT_TYPE, REFLECTION_TRIGGER,
        REFERENCE_SIGNALS, createNode, createEdge } = require("../ace/cognitive-types");

describe("cognitive-types", () => {
  test("COGNITIVE_LAYER has 7 entries", () => {
    expect(Object.keys(COGNITIVE_LAYER).length).toBe(7);
  });
  test("NODE_TYPE has expected types", () => {
    expect(NODE_TYPE.PERSON).toBeDefined();
    expect(NODE_TYPE.PROJECT).toBeDefined();
    expect(NODE_TYPE.GOAL).toBeDefined();
  });
  test("EDGE_TYPE has DEPENDS_ON", () => {
    expect(EDGE_TYPE.DEPENDS_ON).toBeDefined();
  });
  test("REFERENCE_SIGNALS includes Turkish and English", () => {
    expect(REFERENCE_SIGNALS.has("devam")).toBe(true);
    expect(REFERENCE_SIGNALS.has("bunu")).toBe(true);
    expect(REFERENCE_SIGNALS.has("tamam")).toBe(true);
    expect(REFERENCE_SIGNALS.has("continue")).toBe(true);
  });
  test("createNode factory produces valid node", () => {
    const n = createNode({ id: "n1", type: NODE_TYPE.PROJECT, label: "CODEGA" });
    expect(n.id).toBe("n1");
    expect(n.type).toBe(NODE_TYPE.PROJECT);
    expect(n.confidence).toBeGreaterThan(0);
    expect(n.createdAt).toBeDefined();
  });
  test("createEdge factory produces valid edge", () => {
    const e = createEdge({ from: "a", to: "b", type: EDGE_TYPE.DEPENDS_ON });
    expect(e.from).toBe("a");
    expect(e.to).toBe("b");
    expect(e.type).toBe(EDGE_TYPE.DEPENDS_ON);
  });
});

// ── LifeGraph ────────────────────────────────────────────────────────────────
const { LifeGraph } = require("../ace/life-graph");

describe("LifeGraph", () => {
  let dir, lg;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lg-"));
    lg  = new LifeGraph(dir);
    lg.init();
  });
  test("upsert and get node", () => {
    lg.upsertNode({ id: "prj1", type: "PROJECT", label: "CODEGA AI" });
    expect(lg.getNode("prj1").label).toBe("CODEGA AI");
  });
  test("upsert edge and traverse neighbors", () => {
    lg.upsertNode({ id: "u1",   type: "PERSON",  label: "Yunus" });
    lg.upsertNode({ id: "prj1", type: "PROJECT", label: "CODEGA" });
    lg.upsertEdge({ from: "u1", to: "prj1", type: "CREATED_BY" });
    // neighbors returns {node, edge, depth} objects
    const neighbors = lg.neighbors("u1");
    expect(neighbors.some(({ node }) => node.id === "prj1")).toBe(true);
  });
  test("findByType returns matching nodes", () => {
    lg.upsertNode({ id: "g1", type: "GOAL",    label: "Cursor'u geç" });
    lg.upsertNode({ id: "p1", type: "PROJECT", label: "CODEGA" });
    expect(lg.findByType("GOAL").length).toBe(1);
    expect(lg.findByType("PROJECT").length).toBe(1);
  });
  test("summary returns node and edge counts", () => {
    lg.upsertNode({ id: "n1", type: "PROJECT", label: "Test" });
    const s = lg.summary();
    expect(s.nodeCount).toBeGreaterThanOrEqual(1);
    expect(s.edgeCount).toBeGreaterThanOrEqual(0);
  });
});

// ── SensoryMemory ─────────────────────────────────────────────────────────────
const { SensoryMemory } = require("../ace/sensory-memory");

describe("SensoryMemory", () => {
  test("setMessage stores object and snapshot exposes lastMessage", () => {
    const sm = new SensoryMemory();
    sm.setMessage({ role: "user", content: "Merhaba" });
    const snap = sm.snapshot();
    expect(snap.lastMessage?.content).toBe("Merhaba");
    expect(snap.lastMessage?.role).toBe("user");
  });
  test("addTool stores tool name and snapshot returns array", () => {
    const sm = new SensoryMemory();
    sm.addTool("bash");
    const snap = sm.snapshot();
    expect(Array.isArray(snap.tools)).toBe(true);
    expect(snap.tools).toContain("bash");
  });
  test("appendToken builds stream", () => {
    const sm = new SensoryMemory();
    sm.appendToken("Hel"); sm.appendToken("lo");
    expect(sm.getStream()).toBe("Hello");
  });
  test("reset clears state", () => {
    const sm = new SensoryMemory();
    sm.setMessage({ role: "user", content: "test" });
    sm.addTool("bash");
    sm.reset();
    expect(sm.snapshot().lastMessage).toBeNull();
    expect(sm.snapshot().tools.length).toBe(0);
  });
});

// ── WorkingMemory ─────────────────────────────────────────────────────────────
const { WorkingMemory } = require("../ace/working-memory");

describe("WorkingMemory", () => {
  test("setProject and snapshot.activeProject", () => {
    const wm = new WorkingMemory();
    wm.setProject("CODEGA AI");
    expect(wm.snapshot().activeProject).toBe("CODEGA AI");
  });
  test("setMission and setTask", () => {
    const wm = new WorkingMemory();
    wm.setMission("Sprint ACE");
    wm.setTask("ace-os.js yaz");
    const snap = wm.snapshot();
    expect(snap.activeMission).toBe("Sprint ACE");
    expect(snap.currentTask).toBe("ace-os.js yaz");
  });
  test("addDecision appears in snapshot", () => {
    const wm = new WorkingMemory();
    wm.addDecision("PHP kullan", "legacy uyum");
    const snap = wm.snapshot();
    expect(snap.recentDecisions.length).toBeGreaterThan(0);
    expect(snap.recentDecisions[0].decision).toBe("PHP kullan");
  });
  test("addQuestion and resolveQuestion", () => {
    const wm = new WorkingMemory();
    wm.addQuestion("Veritabanı ne?");
    expect(wm.snapshot().openQuestions.length).toBe(1);
    wm.resolveQuestion("Veritabanı ne?");
    expect(wm.snapshot().openQuestions.length).toBe(0);
  });
  test("incrementTurn updates turnCount", () => {
    const wm = new WorkingMemory();
    wm.incrementTurn(); wm.incrementTurn();
    expect(wm.snapshot().turnCount).toBe(2);
  });
});

// ── ConversationMemory ────────────────────────────────────────────────────────
const { ConversationMemory } = require("../ace/conversation-memory");

describe("ConversationMemory", () => {
  let dir, cm;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-"));
    cm  = new ConversationMemory(dir);
    cm.init();
  });
  test("addTopic and commit produces entry", () => {
    cm.addTopic("Builder mimarisi");
    cm.addTopic("PHP entegrasyonu");
    const rec = cm.commit("CODEGA AI Builder tartışması");
    expect(rec.summary).toContain("CODEGA AI Builder");
  });
  test("commit with projectLabel enables forProject lookup", () => {
    cm.addTopic("Test konusu");
    cm.commit("Test özeti", "CODEGA AI");
    const results = cm.forProject("CODEGA AI");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].summary).toBe("Test özeti");
  });
  test("recent(n) returns latest n entries", () => {
    cm.commit("Özet 1"); cm.commit("Özet 2"); cm.commit("Özet 3");
    expect(cm.recent(2).length).toBe(2);
  });
  test("addDecision and commit includes decisions", () => {
    cm.addDecision("MariaDB seçildi");
    const rec = cm.commit("DB kararı");
    expect(rec.decisions.length).toBe(1);
  });
});

// ── ProjectBrain ──────────────────────────────────────────────────────────────
const { ProjectBrain } = require("../ace/project-brain");

describe("ProjectBrain", () => {
  let dir, pb;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-"));
    pb  = new ProjectBrain(dir);
    pb.init();
  });
  test("getOrCreate creates project on first call", () => {
    const p = pb.getOrCreate("CODEGA AI");
    expect(p.label).toBe("CODEGA AI");
  });
  test("addArchitecture persists in project", () => {
    pb.addArchitecture("CODEGA AI", "Electron + Node.js monorepo");
    expect(pb.getOrCreate("CODEGA AI").architecture).toContain("Electron + Node.js monorepo");
  });
  test("contextFor returns non-empty string for known project", () => {
    pb.addArchitecture("CODEGA AI", "Electron frontend");
    const ctx = pb.contextFor("CODEGA AI");
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeGreaterThan(10);
  });
  test("completeMission moves to completedMissions", () => {
    pb.addOpenTodo("CODEGA AI", "Sprint ACE tamamla");
    pb.completeMission("CODEGA AI", "Sprint ACE tamamla");
    const p = pb.getOrCreate("CODEGA AI");
    expect(p.completedMissions).toContain("Sprint ACE tamamla");
  });
  test("resolveTodo removes from openTodos", () => {
    pb.addOpenTodo("CODEGA AI", "Bir görev");
    const p = pb.getOrCreate("CODEGA AI");
    const id = p.openTodos[0];
    pb.resolveTodo("CODEGA AI", id);
    expect(pb.getOrCreate("CODEGA AI").openTodos).not.toContain(id);
  });
});

// ── UserBrain ─────────────────────────────────────────────────────────────────
const { UserBrain } = require("../ace/user-brain");

describe("UserBrain", () => {
  let dir, ub;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ub-"));
    ub  = new UserBrain(dir);
    ub.init();
  });
  test("observe creates user with languages and goals", () => {
    ub.observe("yunus", { languages: ["PHP","JS"], goals: ["CODEGA'yı Cursor'dan iyi yap"] });
    const u = ub.get("yunus");
    expect(u.languages).toContain("PHP");
    expect(u.longTermGoals.length).toBe(1);
  });
  test("contextFor returns string with user info", () => {
    ub.observe("yunus", { languages: ["PHP"] });
    const ctx = ub.contextFor("yunus");
    expect(ctx).toContain("PHP");
  });
  test("addGoal persists goal", () => {
    ub.addGoal("yunus", "Cursor'u geç");
    expect(ub.get("yunus").longTermGoals).toContain("Cursor'u geç");
  });
  test("summary returns known:true after observe", () => {
    ub.observe("yunus", {});
    expect(ub.summary().known).toBe(true);
  });
});

// ── EngineeringBrain ──────────────────────────────────────────────────────────
const { EngineeringBrain, KNOWLEDGE_TYPE } = require("../ace/engineering-brain");

describe("EngineeringBrain", () => {
  let dir, eb;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-"));
    eb  = new EngineeringBrain(dir);
    eb.init();
  });
  test("learn adds a knowledge item", () => {
    const k = eb.learn({ type: KNOWLEDGE_TYPE.BUG_PATTERN, title: "mainWindow undefined", description: "lazy lookup gerekir" });
    expect(k.type).toBe(KNOWLEDGE_TYPE.BUG_PATTERN);
    expect(k.id).toBeDefined();
  });
  test("duplicate learn increases confidence", () => {
    eb.learn({ type: KNOWLEDGE_TYPE.SOLUTION, title: "Universal binary", confidence: 0.8 });
    const k2 = eb.learn({ type: KNOWLEDGE_TYPE.SOLUTION, title: "Universal binary", confidence: 0.8 });
    expect(k2.confidence).toBeGreaterThan(0.8);
  });
  test("query filters by type", () => {
    eb.learn({ type: KNOWLEDGE_TYPE.ANTIPATTERN, title: "Senkron fs büyük dosyalarda" });
    const results = eb.query({ type: KNOWLEDGE_TYPE.ANTIPATTERN });
    expect(results.length).toBeGreaterThan(0);
  });
  test("relevantFor finds related knowledge by keyword", () => {
    eb.learn({ type: KNOWLEDGE_TYPE.SOLUTION, title: "Electron IPC handler", description: "ipcMain.handle kullan", tags: ["electron","ipc"] });
    const results = eb.relevantFor("electron ipc problemi");
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── GoalMemory ────────────────────────────────────────────────────────────────
const { GoalMemory, GOAL_STATUS, GOAL_CATEGORY } = require("../ace/goal-memory");

describe("GoalMemory", () => {
  let dir, gm;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gm-"));
    gm  = new GoalMemory(dir);
    gm.init();
  });
  test("add and active returns goal", () => {
    gm.add({ title: "CODEGA'yı Cursor'dan iyi yap", priority: 10 });
    expect(gm.active().length).toBe(1);
    expect(gm.active()[0].title).toContain("Cursor");
  });
  test("achieve changes status to ACHIEVED", () => {
    const g = gm.add({ title: "Sprint ACE tamamla" });
    gm.achieve(g.id);
    expect(gm.active().length).toBe(0);
    expect(gm.all().find(x=>x.id===g.id).status).toBe(GOAL_STATUS.ACHIEVED);
  });
  test("contextFor returns formatted active goals", () => {
    gm.add({ title: "Cursor'u geç", priority: 9 });
    const ctx = gm.contextFor();
    expect(ctx).toContain("Cursor'u geç");
  });
  test("addMilestone adds to goal", () => {
    const g = gm.add({ title: "Büyük hedef" });
    gm.addMilestone(g.id, "Alpha aşaması");
    expect(gm.all()[0].milestones.length).toBe(1);
  });
  test("summary returns counts", () => {
    gm.add({ title: "Hedef 1" });
    const g2 = gm.add({ title: "Hedef 2" });
    gm.achieve(g2.id);
    const s = gm.summary();
    expect(s.active).toBe(1);
    expect(s.achieved).toBe(1);
  });
});

// ── ReferenceResolver ─────────────────────────────────────────────────────────
const { resolveReference, detectReferenceType, isReferenceMessage } = require("../ace/reference-resolver");

describe("ReferenceResolver", () => {
  test("devam et → type devam", () => {
    expect(detectReferenceType("devam et").type).toBe("devam");
    expect(detectReferenceType("continue").type).toBe("devam");
    expect(detectReferenceType("proceed").type).toBe("devam");
  });
  test("bunu yap → type bunu", () => {
    expect(detectReferenceType("bunu yap").type).toBe("bunu");
    expect(detectReferenceType("this").type).toBe("bunu");
  });
  test("tamam / ok → type tamam", () => {
    expect(detectReferenceType("tamam").type).toBe("tamam");
    expect(detectReferenceType("ok").type).toBe("tamam");
    expect(detectReferenceType("evet").type).toBe("tamam");
  });
  test("isReferenceMessage detects references correctly", () => {
    expect(isReferenceMessage("devam")).toBe(true);
    expect(isReferenceMessage("continue")).toBe(true);
    expect(isReferenceMessage("Electron IPC'yi düzelt")).toBe(false);
  });
  test("resolveReference expands with active task", () => {
    const wm = new WorkingMemory();
    wm.setTask("ace-os.js dosyasını yaz");
    const r = resolveReference("devam et", wm, null);
    expect(r.resolved).toBe(true);
    expect(r.expandedMessage).toContain("ace-os.js");
  });
  test("resolveReference uses active project when no task", () => {
    const wm = new WorkingMemory();
    wm.setProject("CODEGA AI");
    const r = resolveReference("continue", wm, null);
    expect(r.resolved).toBe(true);
    expect(r.expandedMessage).toContain("CODEGA AI");
  });
  test("non-reference message returns resolved:false", () => {
    const wm = new WorkingMemory();
    const r = resolveReference("Electron IPC bug'ını düzelt", wm, null);
    expect(r.resolved).toBe(false);
    expect(r.expandedMessage).toBe("Electron IPC bug'ını düzelt");
  });
});

// ── ContextReconstructor ──────────────────────────────────────────────────────
const { ContextReconstructor } = require("../ace/context-reconstructor");

describe("ContextReconstructor", () => {
  test("reconstruct returns context string with token estimate", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-"));
    const ub  = new UserBrain(dir);
    const wm  = new WorkingMemory();
    ub.init();
    ub.observe("yunus", { languages: ["PHP","JS"], goals: ["Cursor'u geç"] });
    wm.setProject("CODEGA AI");
    wm.setTask("Bağlam inşası test et");
    const cr     = new ContextReconstructor({ userBrain: ub, workingMemory: wm });
    const result = cr.reconstruct({ userId: "yunus", topic: "ACE test" });
    expect(result.context.length).toBeGreaterThan(10);
    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(result.trimmed).toBe(false);
  });
  test("quickContext returns single-line project+task string", () => {
    const wm = new WorkingMemory();
    wm.setProject("CODEGA AI");
    wm.setTask("Test görevi");
    const cr = new ContextReconstructor({ workingMemory: wm });
    const q  = cr.quickContext();
    expect(q).toContain("CODEGA AI");
    expect(q).toContain("Test görevi");
  });
  test("reconstruct respects maxTokens limit", () => {
    const wm = new WorkingMemory();
    wm.setProject("Test Projesi");
    const cr     = new ContextReconstructor({ workingMemory: wm });
    const result = cr.reconstruct({ maxTokens: 1 });
    expect(result.tokenEstimate).toBeLessThanOrEqual(1);
  });
});

// ── SelfReflector ─────────────────────────────────────────────────────────────
const { SelfReflector } = require("../ace/self-reflector");

describe("SelfReflector", () => {
  test("reflect returns reflection object with id", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-"));
    const cm  = new ConversationMemory(dir);
    cm.init();
    cm.addTopic("Builder mimarisi");
    cm.addDecision("PHP seçildi");
    const wm = new WorkingMemory();
    wm.setProject("CODEGA AI");
    const sr = new SelfReflector({ conversationMemory: cm, workingMemory: wm });
    const r  = await sr.reflect({ userId: "yunus" });
    expect(r.id).toBeDefined();
    expect(Array.isArray(r.learned)).toBe(true);
    expect(Array.isArray(r.unfinished)).toBe(true);
  });
  test("multiple reflects increment summary count", async () => {
    const sr = new SelfReflector({});
    await sr.reflect({ userId: "test" });
    await sr.reflect({ userId: "test" });
    expect(sr.summary().total).toBe(2);
  });
  test("reflect with open questions adds to unfinished", async () => {
    const wm = new WorkingMemory();
    wm.addQuestion("Veritabanı şeması hazır mı?");
    const sr = new SelfReflector({ workingMemory: wm });
    const r  = await sr.reflect({ userId: "test" });
    expect(r.unfinished.length).toBeGreaterThan(0);
  });
});

// ── ACEOS Integration ────────────────────────────────────────────────────────
const { ACEOS } = require("../ace/ace-os");

describe("ACEOS Integration", () => {
  let dir, ace;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ace-"));
    ace = new ACEOS(dir);
    await ace.init();
  });
  test("init sets _ready to true", () => {
    expect(ace._ready).toBe(true);
  });
  test("activateProject sets working memory activeProject", () => {
    ace.activateProject("CODEGA AI", "yunus");
    expect(ace.workingMemory.snapshot().activeProject).toBe("CODEGA AI");
  });
  test("processIncoming resolves reference using active task", () => {
    ace.workingMemory.setProject("CODEGA AI");
    ace.workingMemory.setTask("ace-os tamamla");
    const r = ace.processIncoming("devam et", "yunus");
    expect(r.resolved).toBe(true);
    expect(r.message).toContain("ace-os");
  });
  test("processIncoming passes through non-reference message", () => {
    const r = ace.processIncoming("Electron IPC bug'ını düzelt", "yunus");
    expect(r.resolved).toBe(false);
    expect(r.message).toBe("Electron IPC bug'ını düzelt");
  });
  test("buildContext returns context string and token estimate", () => {
    ace.activateProject("CODEGA AI", "yunus");
    const { context, tokenEstimate } = ace.buildContext({ userId: "yunus" });
    expect(typeof context).toBe("string");
    expect(tokenEstimate).toBeGreaterThanOrEqual(0);
  });
  test("endConversation returns reflection", async () => {
    ace.activateProject("CODEGA AI", "yunus");
    ace.conversationMemory.addTopic("Sprint ACE");
    const r = await ace.endConversation({ userId: "yunus" });
    expect(r.id).toBeDefined();
    expect(r.project).toBe("CODEGA AI");
  });
  test("dashboard returns all expected sections", () => {
    const d = ace.dashboard();
    expect(d.lifeGraph).toBeDefined();
    expect(d.workingMemory).toBeDefined();
    expect(d.goals).toBeDefined();
    expect(d.engineering).toBeDefined();
    expect(d.ready).toBe(true);
  });

  // ── Gerçek chat pipeline entegrasyonu — kabul kriterleri ───────────────────

  test("processIncoming: bilinen proje adı söylendiğinde (\"Ateş Fiat\") o projeyi aktive eder", () => {
    ace.projectBrain.getOrCreate("Ateş Fiat");
    const r = ace.processIncoming("Ateş Fiat", "yunus");
    expect(r.resolved).toBe(true);
    expect(ace.workingMemory.snapshot().activeProject).toBe("Ateş Fiat");
  });

  test("processIncoming: tanınmayan kısa mesaj projeyi değiştirmez", () => {
    ace.workingMemory.setProject("CODEGA AI");
    const r = ace.processIncoming("Konya", "yunus");
    expect(r.resolved).toBe(false);
    expect(ace.workingMemory.snapshot().activeProject).toBe("CODEGA AI");
  });

  test("processIncoming + buildContext: \"devam et\" sonrası bağlam asla boş olmaz", () => {
    ace.activateProject("CODEGA AI", "yunus");
    ace.workingMemory.setTask("Self QA Agent entegrasyonu");
    const intake = ace.processIncoming("devam et", "yunus");
    expect(intake.resolved).toBe(true);
    expect(intake.message).toContain("Self QA Agent");

    const { context } = ace.buildContext({ userId: "yunus", topic: intake.message });
    expect(context.length).toBeGreaterThan(0);
  });

  test("recordTurn: ConversationMemory'ye turu ekler", () => {
    ace.activateProject("CODEGA AI", "yunus");
    ace.recordTurn({ userId: "yunus", userMessage: "test mesajı", assistantText: "test cevabı" });
    expect(ace.conversationMemory.summary().currentTopics.length).toBeGreaterThan(0);
  });

  test("recordTurn: aktif proje varsa ProjectBrain'i ve LifeGraph'i tazeler", () => {
    ace.activateProject("CODEGA AI", "yunus");
    ace.recordTurn({ userId: "yunus", userMessage: "x", assistantText: "y" });
    expect(ace.projectBrain.get("CODEGA AI").lastActivity).toBeGreaterThan(0);
    const edges = ace.lifeGraph.outEdges("yunus");
    expect(edges.some((e) => e.to === "CODEGA AI" && e.type === "WORKED_ON")).toBe(true);
  });
});
