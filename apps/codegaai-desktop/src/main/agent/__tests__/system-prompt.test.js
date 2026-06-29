"use strict";

/**
 * system-prompt.test.js — System prompt ANTI-LOOP koruması regresyon testleri
 *
 * Yerel modeller adıyla hitap edilince ("CODEGA AI, şunu yap") kimlik
 * tanıtımına sapıp teknik bağlamı bırakıyordu. ANTI-LOOP kuralı bu davranışı
 * yasaklar; bu test kuralın system prompt'tan sessizce çıkarılmasını engeller.
 */

const { buildSystemPrompt } = require("../system-prompt");

describe("system prompt — ANTI-LOOP name-trigger protection", () => {
  let prompt;
  beforeAll(() => { prompt = buildSystemPrompt("chat", {}); });

  test("ANTI-LOOP bölümü mevcut", () => {
    expect(prompt).toContain("ANTI-LOOP");
    expect(prompt).toContain("İSİM TETİKLEME");
  });

  test("adın hitap olduğunu, kimlik sorgusu olmadığını öğretir", () => {
    expect(prompt).toMatch(/HİTAP/i);
    expect(prompt).toMatch(/KİMLİK SORGUSU DEĞİL/i);
  });

  test("teknik soruda kimlik tetiğini yok saymayı dikte eder", () => {
    expect(prompt).toMatch(/teknik göreve odaklan/i);
  });

  test("gereksiz tanıtım/token israfını yasaklar", () => {
    expect(prompt).toMatch(/token harcama/i);
  });

  test("kimlik tanıtımına yalnızca doğrudan kimlik sorusunda izin verir", () => {
    expect(prompt).toMatch(/Sen kimsin\?/);
  });

  test("teknik bağlam bölümü ve sürüm-gömme yasağı mevcut", () => {
    expect(prompt).toContain("Teknik Bağlam");
    expect(prompt).toMatch(/Sürüm sabitlerini koda GÖMME/i);
  });

  test("projectContext verildiğinde prompt'a dahil edilir (regresyon)", () => {
    const withCtx = buildSystemPrompt("chat", { projectContext: "AKTIF-PROJE-XYZ" });
    expect(withCtx).toContain("AKTIF-PROJE-XYZ");
  });
});
