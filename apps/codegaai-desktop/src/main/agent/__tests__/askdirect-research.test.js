"use strict";

const { ModelManager, extractResearchQuery, resolveWeatherCity, wantsWebResearch } = require("../../model-manager");
const { TOOLS } = require("../tools");

describe("extractResearchQuery: temiz sorgu (Türkçe-güvenli, domain-öncelikli)", () => {
  test("domain'i sorgu yapar, 'araştırma'yı KIRPMAZ", () => {
    // Eski bug: 'araştırma' → 'ştırma' (ş yüzünden \bara\b ortadan kırpıyordu)
    const q = extractResearchQuery("r10.net hakkında bana araştırma yapar mısın?");
    expect(q).toBe("r10.net");
    expect(q).not.toMatch(/ştırma|yapar|mısın|hakkında/i);
  });
  test("domain yoksa komut sözcükleri temizlenir", () => {
    expect(extractResearchQuery("internette laravel performans araştır")).toMatch(/laravel performans/);
  });

});

describe("araştırma ve hava niyeti yönlendirmesi", () => {
  test("yönetimini kelimesindeki 'net' internet araştırması sayılmaz", () => {
    expect(wantsWebResearch("Cache Stampede yönetimini hangi iki tasarım deseniyle çözersin?")).toBe(false);
  });

  test("açık güncel bilgi isteği araştırma gerektirir", () => {
    expect(wantsWebResearch("Döviz kurunda güncel durum nedir?")).toBe(true);
  });

  test("hava sorusundan sonraki kısa konumu bağlamdan çözer", () => {
    const history = [{ role: "user", content: "Konya'da hava durumu nedir?" }];
    expect(resolveWeatherCity("Konya Selçuklu", history)).toBe("Konya Selçuklu");
  });
});

// askDirect web araştırma: (1) domain'li "bilgi ver" araştırma tetikler,
// (2) araştırma başarısızsa model UYDURMAZ, dürüst mesaj döner.
describe("askDirect web araştırma (uydurma önleme)", () => {
  test("güncel hava sorusunu modele değil weather aracına yollar", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    let generateCalled = 0;
    mgr.generate = async () => { generateCalled += 1; return "İnternet erişimim yok."; };
    const orig = TOOLS.weather.fn;
    TOOLS.weather.fn = async (city) => `${city} için güncel hava 24 °C.`;
    try {
      const res = await mgr.askDirect("Konya'da hava durumu nedir?", { chatId: "weather1" });
      expect(res.source).toBe("direct_weather");
      expect(res.text).toMatch(/24 °C/);
      expect(generateCalled).toBe(0);
    } finally { TOOLS.weather.fn = orig; }
  });

  test("hava konuşmasındaki kısa ilçe takibini weather aracına yollar", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    const orig = TOOLS.weather.fn;
    const cities = [];
    TOOLS.weather.fn = async (city) => { cities.push(city); return `${city}: açık`; };
    try {
      await mgr.askDirect("Konya'da hava durumu nedir?", { chatId: "weather2" });
      const res = await mgr.askDirect("Konya Selçuklu", { chatId: "weather2" });
      expect(res.source).toBe("direct_weather");
      expect(cities).toEqual(["Konya", "Konya Selçuklu"]);
    } finally { TOOLS.weather.fn = orig; }
  });
  test("araştırma başarısız → uydurmaz, dürüst mesaj döner (model çağrılmaz)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    let generateCalled = 0;
    mgr.generate = async () => { generateCalled += 1; return "Risk Technology Network Ltd A.Ş."; };
    const orig = TOOLS.research.fn;
    TOOLS.research.fn = async () => "⚠️ ağ hatası";
    try {
      const res = await mgr.askDirect("r10.net hakkında bana araştırma yapar mısın?", { chatId: "rf1" });
      expect(res.source).toBe("direct_research_failed");
      expect(res.text).toMatch(/UYDURMAM/);
      expect(res.text).not.toMatch(/Risk Technology/); // hayalî içerik üretilmedi
      expect(generateCalled).toBe(0);                   // model hiç çağrılmadı
    } finally { TOOLS.research.fn = orig; }
  });

  test("domain'li 'bilgi ver' araştırma tetikler; başarılı → özet döner", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    mgr.generate = async () => "r10.net bir webmaster/forum topluluğudur.";
    const orig = TOOLS.research.fn;
    TOOLS.research.fn = async () => "Kaynak: r10.net Türk webmaster topluluğu ve forumudur.";
    try {
      const res = await mgr.askDirect("r10.net hakkında bilgi verir misin?", { chatId: "rf2" });
      expect(res.source).toBe("direct_research");
      expect(res.text).toMatch(/webmaster/i);
    } finally { TOOLS.research.fn = orig; }
  });

  test("araştırma özeti emoji/unicode salatasıysa → kaynak-temelli fallback (salata gösterilmez)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    mgr.generate = async () => "# TEKKAN 🔥🔩✨❗✅☝️😎πφδμλΣΩαβγΑΒΓΔqwertyuiopasdfgjhkldfzxcsedcrfv metal";
    const orig = TOOLS.research.fn;
    TOOLS.research.fn = async () => [
      "📚 Araştırma: tekcanmetal.com", "",
      "### Kaynak 1: Tekcan Metal",
      "https://tekcanmetal.com/",
      "Tekcan Metal, metal sanayi ve ticaret firmasıdır.",
    ].join("\n");
    try {
      const res = await mgr.askDirect("tekcanmetal.com hakkında bilgi", { chatId: "rf4" });
      expect(res.source).toBe("direct_research");
      expect(res.text).not.toMatch(/qwertyuiop|πφδμλ/);
      expect(res.text).toMatch(/tekcanmetal\.com/);
      expect(res.text).toMatch(/kaynaklara bagli/i);
    } finally { TOOLS.research.fn = orig; }
  });

  test("successful research ignores numeric model drift and returns grounded sources", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    mgr.generate = async () => "0.75";
    const orig = TOOLS.research.fn;
    TOOLS.research.fn = async () => [
      "Research: codegaai",
      "",
      "### Kaynak 1: CODEGA AI Docs",
      "https://example.com/codegaai",
      "CODEGA AI local-first, tool-capable desktop agent platform.",
      "",
      "### Kaynak 2: Release Notes",
      "https://example.com/releases",
      "Release notes mention model-router and web research reliability.",
    ].join("\n");
    try {
      const res = await mgr.askDirect("codegaai hakkinda internette arastir", { chatId: "rf3" });
      expect(res.source).toBe("direct_research");
      expect(res.text).not.toBe("0.75");
      expect(res.text).toMatch(/kaynaklara bagli/i);
      expect(res.text).toMatch(/https:\/\/example\.com\/codegaai/);
      expect(res.text).toMatch(/CODEGA AI Docs/);
    } finally { TOOLS.research.fn = orig; }
  });
});
