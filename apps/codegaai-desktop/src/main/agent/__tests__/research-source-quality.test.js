"use strict";

// Kaynak kalitesi skoru + tazelik etiketi + resmi kaynak önceliklendirmesi.
// AGENT_HANDOFF (alpha.90 grounding guard) notundaki "gelecek iyileştirme" maddesi.

const {
  ModelManager,
  classifyResearchSource,
  scoreResearchSource,
  rankResearchSources,
  extractSourceYear,
  sourceFreshnessLabel,
} = require("../../model-manager");
const { TOOLS } = require("../tools");

const NOW = new Date("2026-07-02T12:00:00Z");

describe("classifyResearchSource: alan adı → kaynak katmanı", () => {
  test("gov/edu (TR dahil) resmi sayılır", () => {
    expect(classifyResearchSource("https://www.resmigazete.gov.tr/x").tier).toBe("official");
    expect(classifyResearchSource("https://tuik.gov.tr/veri").tier).toBe("official");
    expect(classifyResearchSource("https://odtu.edu.tr/duyuru").tier).toBe("official");
    expect(classifyResearchSource("https://data.gov/dataset").tier).toBe("official");
  });
  test("resmi dokümantasyon docs katmanıdır", () => {
    expect(classifyResearchSource("https://docs.python.org/3/").tier).toBe("docs");
    expect(classifyResearchSource("https://developer.mozilla.org/tr/").tier).toBe("docs");
    expect(classifyResearchSource("https://requests.readthedocs.io/").tier).toBe("docs");
  });
  test("forum/topluluk düşük katmandır", () => {
    expect(classifyResearchSource("https://r10forum.net/konu").tier).toBe("forum");
    expect(classifyResearchSource("https://eksisozluk.com/x").tier).toBe("forum");
    expect(classifyResearchSource("https://www.reddit.com/r/x").tier).toBe("forum");
  });
  test("bozuk/boş URL genel katmana düşer, exception atmaz", () => {
    expect(classifyResearchSource("").tier).toBe("general");
    expect(classifyResearchSource("not-a-url").tier).toBe("general");
  });
});

describe("extractSourceYear + sourceFreshnessLabel: tarih/tazelik", () => {
  test("dd.mm.yyyy ve yalın yıl yakalanır, en yenisi seçilir", () => {
    expect(extractSourceYear({ snippet: "12.05.2024 tarihli rapor, 2019 verisi" })).toBe(2024);
    expect(extractSourceYear({ title: "2025 yılı değerlendirmesi", snippet: "" })).toBe(2025);
  });
  test("tarih yoksa null döner, etiket boş olur", () => {
    expect(extractSourceYear({ snippet: "tarihsiz metin" })).toBeNull();
    expect(sourceFreshnessLabel(null, NOW)).toBe("");
  });
  test("yaş ≤1 güncel, ≥3 eski olabilir", () => {
    expect(sourceFreshnessLabel(2026, NOW)).toBe("güncel · 2026");
    expect(sourceFreshnessLabel(2025, NOW)).toBe("güncel · 2025");
    expect(sourceFreshnessLabel(2024, NOW)).toBe("2024");
    expect(sourceFreshnessLabel(2021, NOW)).toBe("eski olabilir · 2021");
  });
});

describe("scoreResearchSource + rankResearchSources: resmi kaynak öne geçer", () => {
  test("resmi kaynak forumdan yüksek skor alır", () => {
    const official = { title: "TÜİK", url: "https://tuik.gov.tr/x", snippet: "2026 nüfus istatistikleri açıklandı." };
    const forum = { title: "Forum", url: "https://eksisozluk.com/x", snippet: "bence nüfus şöyledir" };
    expect(scoreResearchSource(official, NOW)).toBeGreaterThan(scoreResearchSource(forum, NOW));
  });
  test("sıralama: resmi > genel > forum; eşit skorda orijinal sıra korunur", () => {
    const ranked = rankResearchSources([
      { title: "Forum", url: "https://forum.example.com/t", snippet: "" },
      { title: "Genel", url: "https://example.com/a", snippet: "" },
      { title: "Resmi", url: "https://mevzuat.gov.tr/k", snippet: "" },
    ], NOW);
    expect(ranked.map((s) => s.title)).toEqual(["Resmi", "Genel", "Forum"]);
  });
  test("skor 0-100 aralığında kalır", () => {
    const s = scoreResearchSource({ title: "x", url: "https://tuik.gov.tr/", snippet: "a".repeat(100) + " 2026" }, NOW);
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

// Uçtan uca: model drift edip fallback'e düşüldüğünde kaynak listesi
// resmi kaynak önce gelecek şekilde ve etiketli yazılmalı.
describe("askDirect research: fallback kaynak listesi kalite sıralı ve etiketli", () => {
  test("resmi kaynak listede foruma göre önce gelir, 'resmi kaynak' etiketi taşır", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    mgr.generate = async () => "0.75"; // drift → grounded fallback
    const orig = TOOLS.research.fn;
    TOOLS.research.fn = async () => [
      "Research: asgari ucret",
      "",
      "### Kaynak 1: Forum yorumu",
      "https://eksisozluk.com/asgari-ucret",
      "kullanıcı yorumları ve tahminler.",
      "",
      "### Kaynak 2: Resmi Gazete",
      "https://www.resmigazete.gov.tr/eskiler/2026/01/20260101.htm",
      "01.01.2026 tarihli kararla asgari ücret tutarı yayımlandı.",
    ].join("\n");
    try {
      const res = await mgr.askDirect("asgari ucret internette arastir", { chatId: "rq1" });
      expect(res.source).toBe("direct_research");
      expect(res.text).toMatch(/resmi kaynak/i);
      const officialIdx = res.text.indexOf("resmigazete.gov.tr");
      const forumIdx = res.text.indexOf("eksisozluk.com");
      expect(officialIdx).toBeGreaterThan(-1);
      expect(forumIdx).toBeGreaterThan(-1);
      expect(officialIdx).toBeLessThan(forumIdx); // resmi kaynak önce
    } finally { TOOLS.research.fn = orig; }
  });
});
