"use strict";

/**
 * instant-answer.test.js — instantAnswer kimlik-tanıtımı footgun regresyonu
 *
 * Bug sınıfı: fast-path "Ben CODEGA AI..." tanıtımı, içinde "codega ai" / "kimsin"
 * geçen UZUN/SOMUT soruları da papağan gibi tanıtımla cevaplıyordu (modeli ve
 * ANTI-LOOP system prompt'unu by-pass ederek). Düzeltme: tanıtım yalnızca KISA,
 * kimlik-odaklı sorularda (<=50 char) çalışır.
 */

const { instantAnswer } = require("../../model-manager");

const isIntro = (s) => String(s || "").startsWith("Ben CODEGA AI");

describe("instantAnswer — kimlik tanıtımı yalnız kısa kimlik sorularında", () => {
  test("kısa kimlik soruları tanıtım döndürür", () => {
    expect(isIntro(instantAnswer("Sen kimsin?"))).toBe(true);
    expect(isIntro(instantAnswer("CODEGA AI nedir?"))).toBe(true);
    expect(isIntro(instantAnswer("Neler yapabilirsin?"))).toBe(true);
    expect(isIntro(instantAnswer("Kendini tanıt"))).toBe(true);
  });

  test("uzun/somut soru tanıtıma ÇÖKMEZ (içinde 'codega ai' geçse bile)", () => {
    const q = "Bu projede CODEGA AI'ın rolü nedir ve nasıl ölçeklenir, mimari olarak açıkla?";
    expect(isIntro(instantAnswer(q))).toBe(false);
  });

  test("uzun soru içinde 'kimsin' geçse bile tanıtıma çökmez", () => {
    const q = "Monorepo güvenliği için kimsin sorusunu da içeren uzun bir analiz yap ve detaylandır lütfen";
    expect(isIntro(instantAnswer(q))).toBe(false);
  });
});
