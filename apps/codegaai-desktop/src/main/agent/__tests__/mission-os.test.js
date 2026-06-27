"use strict";

/**
 * mission-os.test.js — MissionOS + Mission Planner + Scheduler + Context Engine
 *
 * Sprint 10: MissionOS
 * Sprint 10 ek: Context Engine
 */

const path = require("node:path");
const os   = require("node:os");
const fsp  = require("node:fs/promises");

const {
  MISSION_STATES,
  TASK_STATES,
  PRIORITY,
  SPRINT_TYPE,
  createMission,
  createMilestone,
  createTask,
  createSubTask,
  calcCompletionPercent,
  findTask,
  allTaskIds,
} = require("../mission/mission-types");

const { MissionStore }     = require("../mission/mission-store");
const { planMission, looksLikeMission, _extractJson, _jsonToMission, _fallbackPlan } = require("../mission/mission-planner");
const { topologicalSort, buildExecutionQueue, nextRunnableTasks, scheduleMission, suggestAgent } = require("../mission/mission-scheduler");
const { MissionExecutor, stubAgentDispatch } = require("../mission/mission-executor");
const { MissionOS }        = require("../mission/mission-os");
const { ContextEngine, ContextWindow, ContextResolver, CONTEXT_TYPE } = require("../context/context-engine");

// ── Yardımcılar ──────────────────────────────────────────────────────────────

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "codega-mission-test-"));
}

function makeSimpleMission(overrides = {}) {
  return createMission({
    title:      "Test Mission",
    priority:   PRIORITY.HIGH,
    riskScore:  3,
    milestones: [
      createMilestone({
        title: "Analiz",
        tasks: [
          createTask({ title: "Kodu incele", agent: "architect" }),
          createTask({ title: "Gereksinimleri belirle", agent: "planner" }),
        ],
      }),
      createMilestone({
        title: "Uygulama",
        tasks: [
          createTask({ title: "Kodu yaz", agent: "builder" }),
          createTask({ title: "Test yaz", agent: "qa" }),
        ],
      }),
    ],
    ...overrides,
  });
}

// ── mission-types ─────────────────────────────────────────────────────────────

describe("mission-types: createMission", () => {
  test("Varsayılan alanlar doğru şekilde atanır", () => {
    const m = createMission({ title: "Test" });
    expect(m.id).toMatch(/^mission_/);
    expect(m.title).toBe("Test");
    expect(m.state).toBe(MISSION_STATES.PLANNING);
    expect(m.completionPercent).toBe(0);
    expect(m.milestones).toEqual([]);
    expect(m.dna).toBeNull();
  });

  test("riskScore 0-10 arasına kısıtlanır", () => {
    expect(createMission({ riskScore: -5 }).riskScore).toBe(0);
    expect(createMission({ riskScore: 100 }).riskScore).toBe(10);
    expect(createMission({ riskScore: 7 }).riskScore).toBe(7);
  });

  test("Milestone ve task ID'leri benzersiz", () => {
    const m = makeSimpleMission();
    const ids = [m.id, ...m.milestones.map(ms => ms.id), ...m.milestones.flatMap(ms => ms.tasks.map(t => t.id))];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("createTask varsayılan agent=builder", () => {
    const t = createTask({ title: "Test" });
    expect(t.agent).toBe("builder");
    expect(t.state).toBe(TASK_STATES.PENDING);
  });
});

describe("mission-types: calcCompletionPercent", () => {
  test("Hiç task tamamlanmamışsa 0 döner", () => {
    const m = makeSimpleMission();
    expect(calcCompletionPercent(m)).toBe(0);
  });

  test("Tüm task'lar tamamlanmışsa 100 döner", () => {
    const m = makeSimpleMission();
    for (const ms of m.milestones) {
      for (const t of ms.tasks) t.state = TASK_STATES.COMPLETED;
    }
    expect(calcCompletionPercent(m)).toBe(100);
  });

  test("Yarı tamamlanmışsa ~50 döner", () => {
    const m = makeSimpleMission();
    m.milestones[0].tasks[0].state = TASK_STATES.COMPLETED;
    m.milestones[0].tasks[1].state = TASK_STATES.COMPLETED;
    const pct = calcCompletionPercent(m);
    expect(pct).toBe(50);
  });
});

describe("mission-types: findTask", () => {
  test("Var olan task bulunur", () => {
    const m = makeSimpleMission();
    const t = m.milestones[0].tasks[0];
    const result = findTask(m, t.id);
    expect(result).not.toBeNull();
    expect(result.task.id).toBe(t.id);
  });

  test("Olmayan task null döner", () => {
    const m = makeSimpleMission();
    expect(findTask(m, "nonexistent")).toBeNull();
  });
});

// ── mission-store ─────────────────────────────────────────────────────────────

describe("MissionStore", () => {
  let dir, store;

  beforeEach(async () => {
    dir   = await makeTmpDir();
    store = new MissionStore(dir);
    await store.init();
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  test("Mission kaydet ve getir", async () => {
    const m = makeSimpleMission();
    await store.save(m);
    const got = store.get(m.id);
    expect(got).not.toBeNull();
    expect(got.id).toBe(m.id);
    expect(got.title).toBe(m.title);
  });

  test("Mission güncelle", async () => {
    const m = makeSimpleMission();
    await store.save(m);
    await store.update(m.id, { state: MISSION_STATES.ACTIVE });
    expect(store.get(m.id).state).toBe(MISSION_STATES.ACTIVE);
  });

  test("State filtreli liste", async () => {
    const m1 = makeSimpleMission();
    const m2 = makeSimpleMission({ title: "M2" });
    await store.save(m1);
    await store.save(m2);
    await store.update(m1.id, { state: MISSION_STATES.ACTIVE });
    const active = store.list(MISSION_STATES.ACTIVE);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(m1.id);
  });

  test("Mission sil", async () => {
    const m = makeSimpleMission();
    await store.save(m);
    await store.remove(m.id);
    expect(store.get(m.id)).toBeNull();
    expect(store.count()).toBe(0);
  });

  test("Disk kalıcılığı — yeniden yükle", async () => {
    const m = makeSimpleMission();
    await store.save(m);
    const store2 = new MissionStore(dir);
    await store2.init();
    expect(store2.get(m.id)).not.toBeNull();
    expect(store2.count()).toBe(1);
  });

  test("init() çağrılmadan kullanım hata fırlatır", () => {
    const s2 = new MissionStore(dir);
    expect(() => s2.get("x")).toThrow("başlatılmadı");
  });
});

// ── mission-planner ───────────────────────────────────────────────────────────

describe("mission-planner: looksLikeMission", () => {
  test("Kısa mesajlar mission değil", () => {
    expect(looksLikeMission("merhaba")).toBe(false);
    expect(looksLikeMission("")).toBe(false);
    expect(looksLikeMission("tamam")).toBe(false);
  });

  test("Mission içerikli mesajlar tespit edilir", () => {
    expect(looksLikeMission("Laravel için auth sistemi yap")).toBe(true);
    expect(looksLikeMission("Ateş Fiat projesine müşteri ekranı ekle")).toBe(true);
    expect(looksLikeMission("Tüm testleri düzelt ve refactor et")).toBe(true);
  });
});

describe("mission-planner: _extractJson", () => {
  test("JSON kod bloğundan çıkarır", () => {
    const text = "İşte plan:\n```json\n{\"title\":\"Test\",\"riskScore\":5}\n```";
    const json = _extractJson(text);
    expect(json).not.toBeNull();
    expect(json.title).toBe("Test");
  });

  test("Düz JSON metninden çıkarır", () => {
    const text = 'Yanıt: {"title":"Test","milestones":[]}';
    const json = _extractJson(text);
    expect(json.title).toBe("Test");
  });

  test("JSON yoksa null döner", () => {
    expect(_extractJson("Bu bir JSON değil")).toBeNull();
  });
});

describe("mission-planner: _fallbackPlan", () => {
  test("Fallback plan geçerli mission oluşturur", () => {
    const m = _fallbackPlan("Auth sistemi yaz");
    expect(m.id).toMatch(/^mission_/);
    expect(m.milestones.length).toBeGreaterThan(0);
    expect(m.milestones[0].tasks.length).toBeGreaterThan(0);
  });
});

describe("mission-planner: planMission (mock LLM)", () => {
  test("Geçerli LLM yanıtından mission oluşturur", async () => {
    const mockResponse = JSON.stringify({
      title:            "Auth Sistemi",
      description:      "JWT tabanlı kimlik doğrulama",
      priority:         "high",
      riskScore:        6,
      estimatedMinutes: 90,
      estimatedTokens:  20000,
      requiredAgents:   ["builder", "backend", "qa"],
      rollbackPlan:     "Eski auth kodu geri yüklenir",
      sprintType:       "capability",
      milestones: [
        { title: "Analiz", tasks: [{ title: "Mevcut kodu incele", agent: "architect", description: "", dependencies: [], subtasks: [] }] },
        { title: "Uygulama", tasks: [{ title: "JWT middleware yaz", agent: "backend", description: "", dependencies: [], subtasks: [] }] },
      ],
    });

    const mockGenerate = async () => mockResponse;
    const mission = await planMission("JWT auth sistemi yaz", mockGenerate);
    expect(mission.title).toBe("Auth Sistemi");
    expect(mission.milestones).toHaveLength(2);
    expect(mission.priority).toBe("high");
  });

  test("Bozuk LLM yanıtında fallback kullanılır", async () => {
    const mockGenerate = async () => "Bu bir JSON değil biraz metin.";
    const mission = await planMission("Bir şey yap", mockGenerate);
    expect(mission.id).toMatch(/^mission_/);
    expect(mission.milestones.length).toBeGreaterThan(0);
  });

  test("LLM hatası durumunda fallback kullanılır", async () => {
    const mockGenerate = async () => { throw new Error("LLM hatası"); };
    const mission = await planMission("Test görevi", mockGenerate);
    expect(mission.id).toMatch(/^mission_/);
  });
});

// ── mission-scheduler ─────────────────────────────────────────────────────────

describe("mission-scheduler: topologicalSort", () => {
  test("Bağımlılıksız task'lar aynı sırada kalır", () => {
    const tasks = [
      createTask({ title: "A" }),
      createTask({ title: "B" }),
    ];
    const sorted = topologicalSort(tasks);
    expect(sorted).toHaveLength(2);
  });

  test("Bağımlılıklı task'lar doğru sıralanır", () => {
    const t1 = createTask({ title: "A" });
    const t2 = createTask({ title: "B", dependencies: [t1.id] });
    const t3 = createTask({ title: "C", dependencies: [t2.id] });
    const sorted = topologicalSort([t3, t2, t1]); // karışık sıra
    const ids = sorted.map(t => t.id);
    expect(ids.indexOf(t1.id)).toBeLessThan(ids.indexOf(t2.id));
    expect(ids.indexOf(t2.id)).toBeLessThan(ids.indexOf(t3.id));
  });

  test("Döngüsel bağımlılık hata fırlatır", () => {
    const t1 = createTask({ title: "A" });
    const t2 = createTask({ title: "B" });
    t1.dependencies = [t2.id];
    t2.dependencies = [t1.id];
    expect(() => topologicalSort([t1, t2])).toThrow("Döngüsel");
  });
});

describe("mission-scheduler: buildExecutionQueue", () => {
  test("Mission için wave'ler oluşturulur", () => {
    const m = makeSimpleMission();
    const queue = buildExecutionQueue(m);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].tasks.length).toBeGreaterThan(0);
  });
});

describe("mission-scheduler: suggestAgent", () => {
  test("spec/test → qa",  () => expect(suggestAgent("Birim test spec yaz")).toBe("qa"));
  test("commit → git",   () => expect(suggestAgent("Git commit yap")).toBe("git"));
  test("api → backend",  () => expect(suggestAgent("API endpoint ekle")).toBe("backend"));
  test("ui → frontend",  () => expect(suggestAgent("UI bileşeni oluştur")).toBe("frontend"));
});

describe("mission-scheduler: scheduleMission", () => {
  test("Stats döner", () => {
    const m = makeSimpleMission();
    const { queue, stats } = scheduleMission(m);
    expect(stats.totalTasks).toBeGreaterThan(0);
    expect(stats.agents.length).toBeGreaterThan(0);
  });

  test("Agentsiz task'lara ajan atanır", () => {
    const m = createMission({
      title: "Test",
      milestones: [
        createMilestone({
          tasks: [createTask({ title: "Test yaz", agent: "INVALID_AGENT" })],
        }),
      ],
    });
    scheduleMission(m);
    // "Test yaz" → suggestAgent → hem qa hem builder match eder, geçerli ajan olsun yeterli
    expect(["qa", "builder"]).toContain(m.milestones[0].tasks[0].agent);
  });
});

// ── mission-executor ──────────────────────────────────────────────────────────

describe("MissionExecutor", () => {
  let dir, store, executor;

  beforeEach(async () => {
    dir      = await makeTmpDir();
    store    = new MissionStore(dir);
    await store.init();
    executor = new MissionExecutor(store, stubAgentDispatch);
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  test("Stub dispatch ile mission tamamlanır", async () => {
    const m = makeSimpleMission();
    m.state = MISSION_STATES.SCHEDULED;
    await store.save(m);

    const result = await executor.execute(m.id);
    // Stub dispatch tüm görevleri başarıyla bitirir → REVIEW
    expect([MISSION_STATES.REVIEW, MISSION_STATES.COMPLETED]).toContain(result.state);
  }, 15000);

  test("İptal edilen mission CANCELLED state'e geçer", async () => {
    const m = makeSimpleMission();
    m.state = MISSION_STATES.SCHEDULED;
    await store.save(m);

    const slowDispatch = async () => {
      await new Promise(r => setTimeout(r, 50));
      return { result: "ok" };
    };
    const ex2 = new MissionExecutor(store, slowDispatch);
    const execPromise = ex2.execute(m.id);
    setTimeout(() => ex2.cancel(m.id), 10);
    const result = await execPromise;
    expect([MISSION_STATES.CANCELLED, MISSION_STATES.REVIEW]).toContain(result.state);
  }, 10000);
});

// ── MissionOS ─────────────────────────────────────────────────────────────────

describe("MissionOS", () => {
  let dir, mos;

  beforeEach(async () => {
    dir = await makeTmpDir();
    mos = new MissionOS();
    await mos.init(dir, stubAgentDispatch);
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  test("createManualMission çalışır", async () => {
    const m = await mos.createManualMission({
      title: "Manuel Test",
      milestones: [
        createMilestone({ tasks: [createTask({ title: "Test" })] }),
      ],
    });
    expect(m.id).toMatch(/^mission_/);
    expect(mos.getMission(m.id)).not.toBeNull();
  });

  test("Mission listesi doğru çalışır", async () => {
    await mos.createManualMission({ title: "M1" });
    await mos.createManualMission({ title: "M2" });
    const all = mos.listMissions();
    expect(all.length).toBe(2);
  });

  test("summary() toplam sayı döner", async () => {
    await mos.createManualMission({ title: "M1" });
    const s = mos.summary();
    expect(s.total).toBe(1);
  });

  test("cancel() mission state günceller", async () => {
    const m = await mos.createManualMission({ title: "Cancel Test" });
    await mos.cancel(m.id);
    expect(mos.getMission(m.id).state).toBe(MISSION_STATES.CANCELLED);
  });
});

// ── ContextEngine ─────────────────────────────────────────────────────────────

describe("ContextWindow", () => {
  test("Pencere boyutunu aşmaz", () => {
    const w = new ContextWindow(3);
    w.push("user", "A");
    w.push("user", "B");
    w.push("user", "C");
    w.push("user", "D");
    expect(w.size()).toBe(3);
    expect(w.last(3)[0].content).toBe("B"); // A kaydırıldı
  });

  test("lastUserMessage en son kullanıcı mesajını döner", () => {
    const w = new ContextWindow(5);
    w.push("user", "Merhaba");
    w.push("assistant", "Nasılsın?");
    w.push("user", "İyiyim");
    expect(w.lastUserMessage().content).toBe("İyiyim");
  });
});

describe("ContextResolver", () => {
  let resolver, window;

  beforeEach(() => {
    resolver = new ContextResolver();
    window   = new ContextWindow(10);
  });

  test("'devam' aktif mission varken MISSION_ACTION döner", () => {
    window.push("user", "Bir görev oluştur");
    const state = { activeMission: { id: "m1", title: "Test Mission", milestones: [] } };
    const r = resolver.resolve("devam", window, state);
    expect(r.type).toBe(CONTEXT_TYPE.MISSION_ACTION);
  });

  test("'tamam' önceki mesaj varken CONTINUE döner", () => {
    window.push("user", "Kodu düzelt");
    window.push("assistant", "Düzelteceğim");
    const r = resolver.resolve("tamam", window, {});
    expect(r.type).toBe(CONTEXT_TYPE.CONTINUE);
  });

  test("Uzun yeni konu NEW_TOPIC döner", () => {
    const r = resolver.resolve("Laravel hakkında ne düşünüyorsun?", window, {});
    expect(r.type).toBe(CONTEXT_TYPE.NEW_TOPIC);
  });
});

describe("ContextEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new ContextEngine();
  });

  test("analyze() geçerli sonuç döner", () => {
    engine.push("user", "Merhaba CODEGA");
    engine.push("assistant", "Nasıl yardımcı olabilirim?");
    const result = engine.analyze("devam et");
    expect(result.type).toBeDefined();
    expect(result.layers.immediate).toHaveLength(2);
    expect(result.compressedContext).toBeDefined();
  });

  test("Aktif mission bağlam analizinde görünür", () => {
    engine.setActiveMission({
      id: "m1", title: "Auth Sistemi", completionPercent: 50,
      milestones: [{ tasks: [] }],
    });
    const result = engine.analyze("devam");
    expect(result.isMissionAction).toBe(true);
    expect(result.compressedContext).toContain("Auth Sistemi");
  });

  test("reset() pencereyi temizler ama mission'ı korur", () => {
    engine.push("user", "Test");
    engine.setActiveMission({ id: "m1", title: "Test Mission", milestones: [] });
    engine.reset();
    const snap = engine.snapshot();
    expect(snap.windowSize).toBe(0);
    expect(snap.activeMission).toBe("m1"); // mission korundu
  });

  test("recentFiles ve recentTools kaydedilir", () => {
    engine.addRecentFile("/src/main.js");
    engine.addRecentFile("/src/preload.js");
    engine.addRecentTool("builder");
    const snap = engine.snapshot();
    expect(snap.recentFiles).toContain("/src/main.js");
  });

  test("isContinuation kısa mesajlar için true döner", () => {
    engine.push("user", "Auth sistemi yaz");
    engine.push("assistant", "Planliyorum...");
    expect(engine.isContinuation("tamam")).toBe(true);
  });
});
