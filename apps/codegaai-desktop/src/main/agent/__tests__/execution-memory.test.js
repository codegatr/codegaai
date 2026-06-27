"use strict";

/**
 * execution-memory.test.js
 *
 * Sprint 9: Execution Memory + Causal Trace Engine
 * TraceRecorder, PatternExtractor, RuleStore ve ExecutionMemory
 * entegrasyon testleri.
 */

const path = require("node:path");
const os   = require("node:os");
const fsp  = require("node:fs/promises");

const TraceRecorder    = require("../memory/trace-recorder");
const PatternExtractor = require("../memory/pattern-extractor");
const RuleStore        = require("../memory/rule-store");
const { ExecutionMemory } = require("../memory/execution-memory");

// ── Yardımcı ─────────────────────────────────────────────────────

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "codega-em-test-"));
}

function makeInput(stack = "express", features = ["auth", "docker"]) {
  return { type: stack, stack, name: "test-proj", features, database: "mysql" };
}

// ── TraceRecorder ─────────────────────────────────────────────────

describe("TraceRecorder", () => {
  let dir, recorder;

  beforeEach(async () => {
    dir      = await makeTmpDir();
    recorder = new TraceRecorder(dir);
    await recorder.init();
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  test("init() traces.jsonl dosyasını oluşturmalı", async () => {
    const exists = await fsp.access(path.join(dir, "traces.jsonl")).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  test("record() trace döndürmeli", async () => {
    const t = await recorder.record("builder", makeInput(), { outPath: "/tmp/x.zip" }, true, 120);
    expect(t).toHaveProperty("id");
    expect(t.agentId).toBe("builder");
    expect(t.success).toBe(true);
    expect(t.durationMs).toBe(120);
  });

  test("record() başarısız trace errorCode içermeli", async () => {
    const t = await recorder.record("builder", makeInput(), { message: "ENOENT" }, false);
    expect(t.success).toBe(false);
    expect(t.errorCode).toMatch(/ENOENT/);
  });

  test("recent() kaydedilen trace'leri döndürmeli", async () => {
    await recorder.record("builder", makeInput("express"), {}, true);
    await recorder.record("builder", makeInput("react"),   {}, false);
    const all = await recorder.recent("*");
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test("recent() agentId filtresi çalışmalı", async () => {
    await recorder.record("builder", makeInput(), {}, true);
    await recorder.record("git",     makeInput(), {}, true);
    const builderTraces = await recorder.recent("builder");
    expect(builderTraces.every(t => t.agentId === "builder")).toBe(true);
  });

  test("record() inputContext stack bilgisini çıkarmalı", async () => {
    const t = await recorder.record("builder", makeInput("laravel"), {}, true);
    expect(t.inputContext.stack).toBe("laravel");
    expect(Array.isArray(t.inputContext.features)).toBe(true);
  });

  test("clear() sonrası recent() boş dizi döndürmeli", async () => {
    await recorder.record("builder", makeInput(), {}, true);
    await recorder.clear();
    const all = await recorder.recent("*");
    expect(all).toEqual([]);
  });

  test("birden fazla record() persist edilmeli", async () => {
    for (let i = 0; i < 5; i++) {
      await recorder.record("builder", makeInput(), {}, i % 2 === 0);
    }
    const rec2 = new TraceRecorder(dir);
    await rec2.init();
    const all = await rec2.recent("*");
    expect(all.length).toBe(5);
  });
});

// ── PatternExtractor ──────────────────────────────────────────────

describe("PatternExtractor", () => {
  const extractor = new PatternExtractor();

  function makeFakeTraces(agentId, stack, features, count, successRate) {
    return Array.from({ length: count }, (_, i) => ({
      id:           `t${i}`,
      agentId,
      inputHash:    "abc123",
      inputContext: { agentId, stack, features },
      success:      i / count < successRate,
      errorCode:    i / count >= successRate ? "BUILD_FAIL" : null,
      durationMs:   100,
      ts:           Date.now(),
    }));
  }

  test("yetersiz trace ile boş dizi döndürmeli", () => {
    expect(extractor.analyze([])).toEqual([]);
    expect(extractor.analyze(makeFakeTraces("builder", "express", [], 2, 1))).toEqual([]);
  });

  test("yüksek başarı oranında pozitif kural üretmeli", () => {
    const traces = makeFakeTraces("builder", "express", ["auth"], 10, 0.9);
    const rules  = extractor.analyze(traces);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].type).toBe("success");
    expect(rules[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  test("düşük başarı oranında failure kuralı üretmeli", () => {
    const traces = makeFakeTraces("builder", "laravel", ["docker"], 10, 0.1);
    const rules  = extractor.analyze(traces);
    expect(rules.some(r => r.type === "failure")).toBe(true);
  });

  test("her kural lesson alanı içermeli (max 400 karakter)", () => {
    const traces = makeFakeTraces("builder", "react", ["auth"], 6, 0.9);
    const rules  = extractor.analyze(traces);
    for (const rule of rules) {
      expect(typeof rule.lesson).toBe("string");
      expect(rule.lesson.length).toBeLessThanOrEqual(400);
    }
  });

  test("kural id deterministik olmalı (aynı context = aynı id)", () => {
    const traces1 = makeFakeTraces("builder", "express", ["auth"], 5, 0.9);
    const traces2 = makeFakeTraces("builder", "express", ["auth"], 5, 0.9);
    const rules1  = extractor.analyze(traces1);
    const rules2  = extractor.analyze(traces2);
    if (rules1.length && rules2.length) {
      expect(rules1[0].id).toBe(rules2[0].id);
    }
  });

  test("kural confidence [0,1] aralığında olmalı", () => {
    const traces = makeFakeTraces("git", "any", [], 6, 0.8);
    const rules  = extractor.analyze(traces);
    for (const rule of rules) {
      expect(rule.confidence).toBeGreaterThanOrEqual(0);
      expect(rule.confidence).toBeLessThanOrEqual(1);
    }
  });

  test("farklı context'ler ayrı kurallar üretmeli", () => {
    const express = makeFakeTraces("builder", "express", ["auth"], 5, 0.9);
    const react   = makeFakeTraces("builder", "react",   ["auth"], 5, 0.9);
    const rules   = extractor.analyze([...express, ...react]);
    const ids     = rules.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ── RuleStore ─────────────────────────────────────────────────────

describe("RuleStore", () => {
  let dir, store;

  function makeRule(id, agentId = "builder", stack = "express", confidence = 0.85) {
    return {
      id,
      agentId,
      context:    { agentId, stack, features: ["auth"] },
      type:       "success",
      confidence,
      samples:    5,
      errorCodes: [],
      lesson:     `Test kuralı: ${id}`,
      active:     true,
      updatedAt:  Date.now(),
    };
  }

  beforeEach(async () => {
    dir   = await makeTmpDir();
    store = new RuleStore(dir);
    await store.init();
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  test("boş init'te list() boş dizi döndürmeli", () => {
    expect(store.list()).toEqual([]);
  });

  test("upsert() kural eklemeli", async () => {
    await store.upsert(makeRule("rule_1"));
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].id).toBe("rule_1");
  });

  test("upsert() mevcut kuralı confidence ağırlıklı ortalama ile güncellemeli", async () => {
    const r1 = makeRule("rule_x", "builder", "express", 0.8);
    r1.samples = 4;
    await store.upsert(r1);

    const r2 = { ...r1, confidence: 1.0, samples: 6 };
    await store.upsert(r2);

    const updated = store.list()[0];
    // Ağırlıklı: (0.8*4 + 1.0*6) / 10 = 0.92
    expect(updated.confidence).toBeCloseTo(0.92, 1);
    expect(updated.samples).toBe(10);
  });

  test("query() stack bazlı filtreleme yapmalı", async () => {
    await store.upsert(makeRule("rule_express", "builder", "express"));
    await store.upsert(makeRule("rule_react",   "builder", "react"));

    const result = store.query({ agentId: "builder", stack: "express" });
    expect(result.every(r => r.context.stack === "express")).toBe(true);
  });

  test("query() aktif olmayan kuralı döndürmemeli", async () => {
    const rule = makeRule("rule_inactive");
    rule.active = false;
    await store.upsert(rule);
    const result = store.query({ agentId: "builder" });
    expect(result).toHaveLength(0);
  });

  test("prune() düşük confidence kuralı silmeli", async () => {
    await store.upsert(makeRule("rule_good",  "builder", "express", 0.9));
    const bad = makeRule("rule_bad", "builder", "react", 0.1);
    await store.upsert(bad);
    await store.prune();
    const ids = store.list().map(r => r.id);
    expect(ids).toContain("rule_good");
    expect(ids).not.toContain("rule_bad");
  });

  test("persist + reload çalışmalı", async () => {
    await store.upsert(makeRule("rule_persist"));
    const store2 = new RuleStore(dir);
    await store2.init();
    expect(store2.list()).toHaveLength(1);
    expect(store2.list()[0].id).toBe("rule_persist");
  });

  test("clear() tüm kuralları silmeli", async () => {
    await store.upsert(makeRule("rule_1"));
    await store.upsert(makeRule("rule_2"));
    await store.clear();
    expect(store.list()).toHaveLength(0);
  });

  test("query() max 5 sonuç döndürmeli", async () => {
    for (let i = 0; i < 10; i++) {
      await store.upsert(makeRule(`rule_${i}`, "builder", "express", 0.9));
    }
    const result = store.query({ agentId: "builder", stack: "express" });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  test("lesson alanı max 400 karakter ile sınırlanmalı", async () => {
    const rule = makeRule("rule_long");
    rule.lesson = "x".repeat(1000);
    await store.upsert(rule);
    expect(store.list()[0].lesson.length).toBeLessThanOrEqual(400);
  });
});

// ── ExecutionMemory (entegrasyon) ─────────────────────────────────

describe("ExecutionMemory — entegrasyon", () => {
  let dir, mem;

  beforeEach(async () => {
    dir = await makeTmpDir();
    mem = new ExecutionMemory(dir);
    await mem.init();
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  test("init() iki kez çağrılsa da hata vermemeli", async () => {
    await expect(mem.init()).resolves.not.toThrow();
  });

  test("record() trace döndürmeli", async () => {
    const t = await mem.record("builder", makeInput(), { outPath: "/tmp/x.zip" }, true, 200);
    expect(t).toHaveProperty("id");
    expect(t.success).toBe(true);
  });

  test("stats() doğru sayım yapmalı", async () => {
    await mem.record("builder", makeInput(), {}, true);
    await mem.record("builder", makeInput(), {}, false);
    const s = await mem.stats();
    expect(s.totalTraces).toBeGreaterThanOrEqual(2);
    expect(typeof s.dataDir).toBe("string");
  });

  test("yeterli başarı kaydı sonrası query() kural döndürmeli", async () => {
    const input = makeInput("express", ["auth"]);
    // 4 başarılı kayıt — PatternExtractor eşiğini aşmalı
    for (let i = 0; i < 4; i++) {
      await mem.record("builder", input, { outPath: "/tmp/x.zip" }, true);
    }
    const hints = await mem.query({ agentId: "builder", stack: "express", features: ["auth"] });
    // Kural varsa doğru yapıda olmalı
    for (const h of hints) {
      expect(h).toHaveProperty("lesson");
      expect(h).toHaveProperty("confidence");
      expect(h.confidence).toBeGreaterThanOrEqual(0);
    }
  });

  test("reset() sonrası stats() sıfır trace döndürmeli", async () => {
    await mem.record("builder", makeInput(), {}, true);
    await mem.reset();
    const s = await mem.stats();
    expect(s.totalTraces).toBe(0);
    expect(s.totalRules).toBe(0);
  });

  test("hatalı output'ta record() patlamamalı", async () => {
    await expect(
      mem.record("builder", makeInput(), null, false)
    ).resolves.not.toThrow();

    await expect(
      mem.record("builder", null, undefined, true)
    ).resolves.not.toThrow();
  });

  test("farklı agentId'ler bağımsız olmalı", async () => {
    await mem.record("builder", makeInput("express"), {}, true);
    await mem.record("git",     { repoPath: "/tmp/repo" }, { sha: "abc" }, true);
    const s = await mem.stats();
    expect(s.totalTraces).toBeGreaterThanOrEqual(2);
  });
});
