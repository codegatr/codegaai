"use strict";

// Bilmece yönlendirmesi (alpha.105): pratik-zekâ soruları küçük modelde kelime
// salatasına dönüşüyor (Konya maden-suyu vakası) → en güçlü kurulu modele yükselt.

const { isRiddleQuestion, prioritizeStrongModelForHeavyPrompt } = require("../../model-manager");

const KONYA = "Bir adam Konya sıcağında eve dönüyor, elektrikler kesiliyor. Elinde açacak, cebinde çakmak, tezgahta mum var. Maden suyunu içebilmesi için ilk olarak neyi kullanması veya açması gerekir?";

describe("isRiddleQuestion", () => {
  test("Konya maden-suyu tuzağı sezilir", () => {
    expect(isRiddleQuestion(KONYA)).toBe(true);
  });
  test("açık bilmece/mantık etiketi sezilir", () => {
    expect(isRiddleQuestion("Sana bir bilmece: iki babanın oğlu kimdir, açıkla?")).toBe(true);
    expect(isRiddleQuestion("Bu bir pratik zekâ sorusu olsun bakalım hangisi ağır?")).toBe(true);
  });
  test("normal teknik/sohbet sorusu SEZİLMEZ (yanlış pozitif yok)", () => {
    expect(isRiddleQuestion("PHP 8.3 ile PDO bağlantısı nasıl kurulur?")).toBe(false);
    expect(isRiddleQuestion("Merhaba, bugün nasılsın?")).toBe(false);
    expect(isRiddleQuestion("SQL şemasında foreign key indeksi gerekir mi?")).toBe(false);
  });
});

describe("bilmece → en güçlü kurulu modele yükseltme", () => {
  test("14B kuruluysa Konya sorusu ona yönlenir", () => {
    const r = prioritizeStrongModelForHeavyPrompt(KONYA, ["qwen2.5:3b", "qwen2.5:14b"], ["qwen2.5:3b"], {});
    expect(r.escalated).toBe(true);
    expect(r.attemptModels[0]).toBe("qwen2.5:14b");
  });
  test("normal sohbet yükseltilmez", () => {
    const r = prioritizeStrongModelForHeavyPrompt("Merhaba, bugün nasılsın?", ["qwen2.5:3b", "qwen2.5:14b"], ["qwen2.5:3b"], {});
    expect(r.escalated).toBe(false);
  });
  test("autoModelEscalation=false kullanıcı tercihine saygı duyar", () => {
    const r = prioritizeStrongModelForHeavyPrompt(KONYA, ["qwen2.5:3b", "qwen2.5:14b"], ["qwen2.5:3b"], { autoModelEscalation: false });
    expect(r.escalated).toBe(false);
  });
});
