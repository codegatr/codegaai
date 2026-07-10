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

describe("V7 Agentic Partner Core", () => {
  const { buildSystemPrompt } = require("../system-prompt");

  test("agentic partner davranisini arac, test ve self-correction ile baglar", () => {
    const prompt = buildSystemPrompt("code");
    expect(prompt).toContain("V7 Agentic Partner Core");
    expect(prompt).toContain("ReAct dongusu");
    expect(prompt).toContain("Self-correcting loop");
    expect(prompt).toContain("Self-improving loop");
    expect(prompt).toContain("testi tekrar calistir");
  });

  test("otonomiyi guvenlik ve gizli muhakeme sinirlariyla dengeler", () => {
    const prompt = buildSystemPrompt("code");
    expect(prompt).toContain("Guvenlik siniri");
    expect(prompt).toContain("secret");
    expect(prompt).toContain("repo kurallarini asla asma");
    expect(prompt).toContain("gizli zincir-muhakeme");
    expect(prompt).toContain("asla final cevaba dokme");
  });
});

// V7 Soğukkanlılık Çıpası: bilmece/pratik-zekâ sorularında panik + kod-bloğu
// kaçışını sistem talimatı düzeyinde engeller (Konya maden suyu vakası).
describe("soğukkanlılık çıpası (alpha.104)", () => {
  const { buildSystemPrompt } = require("../system-prompt");
  test("her görev tipinde çıpa mevcut ve kod-kaçışını yasaklıyor", () => {
    for (const task of ["chat", "code", "writing"]) {
      const p = buildSystemPrompt(task);
      expect(p).toMatch(/SOĞUKKANLILIK ÇIPASI/);
      expect(p).toMatch(/PANİK YAPMA/);
      expect(p).toMatch(/kod bloğuyla cevap verme/i);
      expect(p).toMatch(/TEK sade cümleyle/);
    }
  });
});
