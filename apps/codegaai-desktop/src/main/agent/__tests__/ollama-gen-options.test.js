"use strict";

/**
 * ollama-gen-options.test.js — Ollama üretim parametreleri (anti-repetition)
 *
 * Bug: ollama isteklerinde yalnız temperature/num_ctx geçiliyordu; repeat_penalty
 * yoktu. Küçük yerel modeller "Bu bu paketi…", "buu…" gibi döngü/tekrar üretiyordu.
 * buildGenOptions artık repeat_penalty + repeat_last_n + top_p/top_k + num_predict ekler.
 */

const { buildGenOptions, DEFAULT_NUM_PREDICT } = require("../ollama-client");

describe("buildGenOptions — anti-repetition / sampling", () => {
  test("varsayılanlar repeat_penalty ve sampling parametrelerini içerir", () => {
    const o = buildGenOptions({});
    expect(o.repeat_penalty).toBeGreaterThan(1);   // tekrar cezası aktif
    expect(o.repeat_last_n).toBeGreaterThanOrEqual(64);
    expect(o.top_p).toBeGreaterThan(0);
    expect(o.top_k).toBeGreaterThan(0);
    expect(o.temperature).toBe(0.2);   // strict/kararlı varsayılan
    expect(o.num_ctx).toBe(8192);
    expect(o.num_predict).toBe(DEFAULT_NUM_PREDICT);
  });

  test("num_predict varsayılan yüksek bütçeyle gelir ve sayı verilince override edilir", () => {
    expect(buildGenOptions({}).num_predict).toBe(4096);
    expect(buildGenOptions({ numPredict: 512 }).num_predict).toBe(512);
  });

  test("opts ile override edilebilir", () => {
    const o = buildGenOptions({ temperature: 0.2, repeatPenalty: 1.3, numCtx: 16384, topP: 0.8, topK: 20 });
    expect(o.temperature).toBe(0.2);
    expect(o.repeat_penalty).toBe(1.3);
    expect(o.num_ctx).toBe(16384);
    expect(o.top_p).toBe(0.8);
    expect(o.top_k).toBe(20);
  });

  test("geçersiz değerler güvenli varsayılana düşer", () => {
    const o = buildGenOptions({ temperature: "abc", repeatPenalty: null, numPredict: -1 });
    expect(o.temperature).toBe(0.2);
    expect(o.repeat_penalty).toBe(1.15);
    expect(o.num_predict).toBe(DEFAULT_NUM_PREDICT);
  });
});
