"use strict";

/**
 * final-answer-multiquestion.test.js
 * ----------------------------------
 * Regresyon: 12 soruluk ([Mantık] … [Sürüm Doğrulama]) bir prompt'a verilen
 * çok-bölümlü cevap, TDE bu etiketleri "görev" saymadığı için sanitizer
 * tarafından tek bir trailing "Final Answer: 0.75" bloğuna ÇÖKERTİLİYORDU.
 * isMultiQuestionInput artık bunu yakalayıp tüm bölümleri korur.
 */

const fas = require("../final-answer-sanitizer");

const TWELVE_Q = [
  "[Mantık] Bir odada 3 kedi vardır...",
  "[Dikkat] Bir çiftçinin 20 ineği vardı...",
  "[Mühakeme] Nilüferler her gün iki katına çıkıyor...",
  "[Matematik] Saat 03:15'te akrep-yelkovan açısı?",
  "[Mimarî] npm workspaces hoisting politikası?",
  "[Otomasyon] release.ps1 Fail-Fast nasıl?",
  "[Performans] MessageChannel + rAF kuyruğu?",
  "[Güvenlik] fs.rename atomik yazma?",
  "[Veri Bütünlüğü] manifest.json + version.php rollback?",
  "[Eşzamanlılık] yerel async Mutex?",
  "[Tedarik Zinciri] overrides politikası?",
  "[Sürüm Doğrulama] TOPLAM_MODUL_SAYISI regex kontrolü?",
].join("\n\n");

describe("isMultiQuestionInput", () => {
  test("köşeli etiketli 12 soruyu çok-soru sayar", () => {
    expect(fas.isMultiQuestionInput(TWELVE_Q)).toBe(true);
  });
  test("tek soruyu çok-soru saymaz", () => {
    expect(fas.isMultiQuestionInput("Saat 03:15'te açı kaç derecedir?")).toBe(false);
  });
  test("3+ köşeli etiket eşiği (2+ karakter etiketler)", () => {
    expect(fas.isMultiQuestionInput("[Mantık] x [Güvenlik] y [Performans] z")).toBe(true);
    expect(fas.isMultiQuestionInput("[Mantık] x [Güvenlik] y")).toBe(false);
  });
});

describe("cleanUserFacingOutput — çok-soru çökmesini engeller", () => {
  test("12 cevap tek 'Final Answer: 0.75'e çökmez", () => {
    const answer = [
      "[Mantık] Kediler üçgen dizilir.",
      "[Dikkat] 6 inek kalır.",
      "[Matematik] 7.5 derece.",
      "İşlem: 3/4 = 0.75",
      "Final Answer: 0.75",
    ].join("\n");
    const res = fas.cleanUserFacingOutput(answer, TWELVE_Q, null);
    expect(res.answer).not.toBe("0.75");
    expect(res.answer).toMatch(/Kediler üçgen/);
    expect(res.answer).toMatch(/6 inek/);
    // İç-akıl satırı ("İşlem:") temizlenmeli
    expect(res.answer).not.toMatch(/İşlem:\s*3\/4/);
  });

  test("tek-soruda eski davranış korunur (Final Answer çökmesi)", () => {
    const answer = "İşlem: 3/4 = 0.75\nFinal Answer: 0.75";
    const res = fas.cleanUserFacingOutput(answer, "3/4 kaçtır?", null);
    expect(res.answer).toBe("0.75");
  });
});
