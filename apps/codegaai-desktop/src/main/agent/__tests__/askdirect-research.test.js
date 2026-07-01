"use strict";

const { ModelManager } = require("../../model-manager");
const { TOOLS } = require("../tools");

// askDirect web araştırma: (1) domain'li "bilgi ver" araştırma tetikler,
// (2) araştırma başarısızsa model UYDURMAZ, dürüst mesaj döner.
describe("askDirect web araştırma (uydurma önleme)", () => {
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
});
