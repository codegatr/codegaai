"use strict";

const { ModelManager, wantsSiteAudit } = require("../../model-manager");
const { TOOLS } = require("../tools");

describe("wantsSiteAudit: site denetimi niyeti", () => {
  test("domain + analiz/artı-eksi niyeti → true", () => {
    expect(wantsSiteAudit("tekcanmetal.com sitesini analiz eder misin?")).toBe(true);
    expect(wantsSiteAudit("r10.net artı ve eksileriyle değerlendir")).toBe(true);
    expect(wantsSiteAudit("https://example.com denetle")).toBe(true);
    expect(wantsSiteAudit("bu siteyi analiz et: ornek.com.tr")).toBe(true);
  });
  test("denetim niyeti olmayan mesajlar → false", () => {
    expect(wantsSiteAudit("r10.net hakkında bilgi ver")).toBe(false);
    expect(wantsSiteAudit("bir PHP fonksiyonu analiz et")).toBe(false);
    expect(wantsSiteAudit("merhaba nasılsın")).toBe(false);
  });
});

describe("askDirect site denetimi akışı", () => {
  test("denetim isteği → yapılandırılmış artı/eksi prompt'u ile özet (source: direct_site_audit)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    let systemSeen = "";
    mgr.generate = async (_m, messages) => {
      systemSeen = messages.find((m) => m.role === "system")?.content || "";
      return "## Genel Bakış\nMetal firması sitesi.\n## ✅ Artılar\n- Katalog var\n## ⚠️ Eksiler\n- SSL bilgisi yok\nKaynak: https://tekcanmetal.com/";
    };
    const orig = TOOLS.research.fn;
    TOOLS.research.fn = async () => [
      "📚 Araştırma: tekcanmetal.com", "",
      "### Kaynak 1: Tekcan Metal",
      "https://tekcanmetal.com/",
      "Tekcan Metal, metal sanayi firmasıdır. Ürün kataloğu mevcut.",
    ].join("\n");
    try {
      const res = await mgr.askDirect("tekcanmetal.com sitesini analiz eder misin?", { chatId: "sa1" });
      expect(res.source).toBe("direct_site_audit");
      expect(systemSeen).toMatch(/SİTE DENETİMİ/);
      expect(systemSeen).toMatch(/Artılar/);
      expect(systemSeen).toMatch(/Eksiler/);
      expect(res.text).toMatch(/Artılar/);
    } finally { TOOLS.research.fn = orig; }
  });
});
