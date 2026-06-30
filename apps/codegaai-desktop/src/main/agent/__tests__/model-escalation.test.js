"use strict";

// Otomatik model yükseltme yardımcıları (ağır promptlarda güçlü modele geç).
const { modelParamSize, strongestInstalledModel } = require("../../model-manager");

describe("modelParamSize", () => {
  test("model adından parametre boyutunu çıkarır", () => {
    expect(modelParamSize("qwen3.5:9b")).toBe(9);
    expect(modelParamSize("qwen3.5:4b")).toBe(4);
    expect(modelParamSize("qwen3.5:0.8b")).toBe(0.8);
    expect(modelParamSize("qwen2.5-coder:3b-instruct")).toBe(3);
  });
  test("boyut yoksa 0", () => {
    expect(modelParamSize("llama3:latest")).toBe(0);
    expect(modelParamSize("")).toBe(0);
  });
});

describe("strongestInstalledModel", () => {
  test("kurulu en büyük modeli seçer", () => {
    const installed = ["qwen3.5:4b", "qwen2.5-coder:3b", "qwen3.5:0.8b", "qwen3.5:9b"];
    const r = strongestInstalledModel(installed);
    expect(r.model).toBe("qwen3.5:9b");
    expect(r.size).toBe(9);
  });
  test("boş liste güvenli", () => {
    expect(strongestInstalledModel([]).model).toBeNull();
  });
  test("sadece küçük modeller kuruluysa en güçlü <7B (yetersiz-model mesajı tetiklenir)", () => {
    const r = strongestInstalledModel(["qwen3.5:4b", "qwen2.5-coder:3b"]);
    expect(r.size).toBeLessThan(7);
  });
  test("9B 4B'den güçlü → yükseltme tetiklenmeli (size karşılaştırması)", () => {
    const installed = ["qwen3.5:4b", "qwen3.5:9b"];
    const strong = strongestInstalledModel(installed);
    expect(strong.size).toBeGreaterThan(modelParamSize("qwen3.5:4b"));
  });
});
