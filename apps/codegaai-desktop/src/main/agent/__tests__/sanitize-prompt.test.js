"use strict";

/**
 * sanitize-prompt.test.js — Girdi-katmanı isim temizleme testleri
 *
 * Yerel modelin adını görünce "Ben CODEGA AI..." personasına sapmasını önlemek
 * için, modele gitmeden önce asistan adı hitap konumunda temizlenir. Bu test,
 * temizleme davranışını ve KİMLİK SORUSU korumasını kilitler.
 */

const { sanitizePrompt, mentionsAssistantName } = require("../sanitize-prompt");

describe("sanitizePrompt — name-trigger input middleware", () => {
  test("baştaki hitabı kaldırır (vocative)", () => {
    expect(sanitizePrompt("CODEGA AI, yeni modülü test et")).toBe("Yeni modülü test et");
  });

  test("'Hey CODEGA AI' önekini kaldırır", () => {
    expect(sanitizePrompt("Hey CODEGA AI bana bir script yaz")).toBe("Bana bir script yaz");
  });

  test("ad varyasyonlarını (codega-ai, codega_ai, codegaai) yakalar", () => {
    expect(sanitizePrompt("codega-ai bu kodu düzelt")).toBe("Bu kodu düzelt");
    expect(sanitizePrompt("codega_ai bu kodu düzelt")).toBe("Bu kodu düzelt");
    expect(sanitizePrompt("codegaai bu kodu düzelt")).toBe("Bu kodu düzelt");
  });

  test("sondaki hitabı kaldırır", () => {
    expect(sanitizePrompt("Bana yardım et CODEGA AI")).toBe("Bana yardım et");
  });

  test("KİMLİK SORUSUNU korur: 'Sen kimsin?'", () => {
    expect(sanitizePrompt("Sen kimsin?")).toBe("Sen kimsin?");
  });

  test("KİMLİK SORUSUNU korur: 'CODEGA AI nedir?'", () => {
    expect(sanitizePrompt("CODEGA AI nedir?")).toBe("CODEGA AI nedir?");
  });

  test("KİMLİK SORUSUNU korur: 'Kendini tanıt'", () => {
    expect(sanitizePrompt("CODEGA AI kendini tanıt")).toBe("CODEGA AI kendini tanıt");
  });

  test("baştaki Türkçe ekli hitabı temiz kaldırır", () => {
    expect(sanitizePrompt("CODEGA AI'ın mimarisini anlat")).toBe("Mimarisini anlat");
    expect(sanitizePrompt("CODEGA AI'ya bir görev ver")).toBe("Bir görev ver");
  });

  test("cümle ortasındaki ekli konu kullanımını bozmaz", () => {
    expect(sanitizePrompt("Bu projede CODEGA AI'ın rolü ne?")).toBe("Bu projede CODEGA AI'ın rolü ne?");
  });

  test("ad geçmeyen mesaja dokunmaz", () => {
    expect(sanitizePrompt("2+2 kaç eder")).toBe("2+2 kaç eder");
  });

  test("yalnızca ad yazıldıysa orijinali döndürür (boş mesaj gönderme)", () => {
    expect(sanitizePrompt("CODEGA AI")).toBe("CODEGA AI");
  });

  test("boş/gecersiz girdiyi olduğu gibi döndürür", () => {
    expect(sanitizePrompt("")).toBe("");
    expect(sanitizePrompt(null)).toBe(null);
    expect(sanitizePrompt(undefined)).toBe(undefined);
  });

  test("mentionsAssistantName ad tespitini doğru yapar", () => {
    expect(mentionsAssistantName("CODEGA AI selam")).toBe(true);
    expect(mentionsAssistantName("merhaba dünya")).toBe(false);
  });
});
