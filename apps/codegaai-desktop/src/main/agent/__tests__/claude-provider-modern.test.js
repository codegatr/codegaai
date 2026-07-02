"use strict";

// Claude sağlayıcısı güncel modele taşındı (alpha.99):
// - Varsayılan: claude-opus-4-8 (claude-sonnet-4-20250514 Haziran 2026'da emekli)
// - Claude 4.7+ ailesi temperature/top_p/top_k kabul etmez (HTTP 400) →
//   payload bu modellerde sampling parametresi GÖNDERMEMELİ.
// - Eski kayıtlı ayarlardaki emekli model, normalize sırasında güncellenir.

const cloud = require("../cloud-provider");
const { DEFAULTS, normalizeSettings } = require("../settings-store");

describe("Claude varsayılan modeli güncel", () => {
  test("PROVIDERS.claude ve DEFAULTS güncel modeli gösterir", () => {
    expect(cloud.PROVIDERS.claude.model).toBe("claude-opus-4-8");
    expect(DEFAULTS.claudeModel).toBe("claude-opus-4-8");
  });
});

describe("anthropicPayload: sampling parametresi model-farkındalıklı", () => {
  const msgs = [
    { role: "system", content: "Sen yardımcı bir asistansın." },
    { role: "user", content: "Merhaba" },
  ];

  test("claude-opus-4-8 → temperature GÖNDERİLMEZ (400 önlenir)", () => {
    const p = cloud._anthropicPayload(msgs, { model: "claude-opus-4-8" }, false);
    expect(p.model).toBe("claude-opus-4-8");
    expect(p).not.toHaveProperty("temperature");
    expect(p.system).toMatch(/asistan/);
    expect(p.messages).toHaveLength(1);
  });

  test("varsayılan model (opts.model yok) de sampling göndermez", () => {
    const p = cloud._anthropicPayload(msgs, {}, false);
    expect(p).not.toHaveProperty("temperature");
  });

  test("eski model (sonnet-4-20250514) geriye dönük temperature almaya devam eder", () => {
    const p = cloud._anthropicPayload(msgs, { model: "claude-sonnet-4-20250514" }, false);
    expect(p.temperature).toBe(0.4);
  });

  test("sampling-kaldırılmış aile tanıma: opus-4-7/4-8, sonnet-5, fable-5", () => {
    expect(cloud._anthropicSamplingRemoved("claude-opus-4-8")).toBe(true);
    expect(cloud._anthropicSamplingRemoved("claude-opus-4-7")).toBe(true);
    expect(cloud._anthropicSamplingRemoved("claude-sonnet-5")).toBe(true);
    expect(cloud._anthropicSamplingRemoved("claude-fable-5")).toBe(true);
    expect(cloud._anthropicSamplingRemoved("claude-sonnet-4-20250514")).toBe(false);
    expect(cloud._anthropicSamplingRemoved("claude-haiku-4-5")).toBe(false);
  });
});

describe("normalizeSettings: emekli Claude modeli otomatik taşınır", () => {
  test("kayıtlı claude-sonnet-4-20250514 → claude-opus-4-8", () => {
    const next = normalizeSettings({ ...DEFAULTS, claudeModel: "claude-sonnet-4-20250514" });
    expect(next.claudeModel).toBe("claude-opus-4-8");
  });

  test("kullanıcının bilinçli seçtiği güncel model korunur", () => {
    const next = normalizeSettings({ ...DEFAULTS, claudeModel: "claude-haiku-4-5" });
    expect(next.claudeModel).toBe("claude-haiku-4-5");
  });
});
