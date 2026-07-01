"use strict";

const { ModelManager } = require("../../model-manager");

// Basit Mod: askDirect yalın yolu — system+history+user → generate. Ağır
// pipeline (chunking/verification/escalation) ÇALIŞMAMALI.
describe("askDirect (Basit Mod)", () => {
  test("doğrudan generate çağırır, akışı döndürür, geçmişi günceller", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let seenMessages = null;
    mgr.generate = async (model, messages, _fb, onToken) => {
      seenMessages = messages;
      if (onToken) onToken("Mer");
      if (onToken) onToken("haba");
      return "Merhaba";
    };

    const tokens = [];
    const res = await mgr.askDirect("requestAnimationFrame nedir?", {
      chatId: "c1",
      onToken: (t) => tokens.push(t),
    });

    expect(res.source).toBe("direct");
    expect(res.text).toBe("Merhaba");
    expect(tokens.join("")).toBe("Merhaba");
    // system + user (geçmiş boş); sanitizePrompt baş harfi büyütebilir
    expect(seenMessages[0].role).toBe("system");
    const lastMsg = seenMessages[seenMessages.length - 1];
    expect(lastMsg.role).toBe("user");
    expect(lastMsg.content).toMatch(/requestanimationframe nedir/i);
    // geçmiş güncellendi
    expect(mgr.historyFor("c1").length).toBe(2);
  });

  test("renderer geçmişiyle tohumlanır (bağlam sürekliliği)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let seen = null;
    mgr.generate = async (_m, messages) => { seen = messages; return "ok"; };

    await mgr.askDirect("devam", {
      chatId: "c2",
      history: [{ role: "user", text: "Konya nüfusu" }, { role: "assistant", text: "~2.2M" }],
    });
    // system + 2 history + user
    expect(seen.some((m) => m.content === "Konya nüfusu")).toBe(true);
    expect(seen[seen.length - 1].content).toMatch(/^devam$/i);
  });

  test("boş üretimde güvenli mesaj döner (kilitlenmez)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => [];
    mgr.generate = async () => "";
    const res = await mgr.askDirect("merhaba", { chatId: "c3" });
    expect(res.text).toMatch(/yanıt üretemedim|Ollama/i);
  });

  test("cognitiveContext ikinci system mesajı olarak eklenir (Bilişsel Mod)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let seen = null;
    mgr.generate = async (_m, messages) => { seen = messages; return "ok"; };
    await mgr.askDirect("bu sorunu çöz", {
      chatId: "c4",
      cognitiveContext: "BİLİŞSEL HAFIZA:\n## Aktif proje: Ateş Fiat\nBilinen sorunlar: UTF8 bozulması",
    });
    // system prompt + muhakeme katmanı (REASONING_GUARDRAILS) + cognitiveContext
    const systemMsgs = seen.filter((m) => m.role === "system");
    expect(systemMsgs.length).toBe(3);
    expect(systemMsgs.some((m) => /Ateş Fiat/.test(m.content))).toBe(true);
    expect(systemMsgs.some((m) => /MANTIK VE DİKKAT KATMANI/.test(m.content))).toBe(true);
    expect(seen[seen.length - 1].content).toMatch(/^bu sorunu çöz$/i);
  });

  test("cognitiveContext boşsa tek system mesajı (Basit Mod)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let seen = null;
    mgr.generate = async (_m, messages) => { seen = messages; return "ok"; };
    await mgr.askDirect("selam", { chatId: "c5", cognitiveContext: "" });
    // temel system prompt + muhakeme katmanı (cognitiveContext boş → eklenmez)
    expect(seen.filter((m) => m.role === "system").length).toBe(2);
  });

  test("varsayılan yolda İNSANİ TON talimatı bulunur (robotik değil)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let seen = null;
    mgr.generate = async (_m, messages) => { seen = messages; return "ok"; };
    await mgr.askDirect("selam", { chatId: "c6" });
    expect(seen.find((m) => m.role === "system").content).toMatch(/İNSANİ TON|sıcak.*doğal/i);
  });
});
