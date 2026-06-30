"use strict";

// Nirvana kök-neden: main'in bellek-içi geçmişi yeniden başlatmada boşalıyor;
// renderer kalıcı geçmişi taşıyor ve main BOŞKEN onunla tohumlanmalı.
const { seedConversationHistory } = require("../../model-manager");

describe("seedConversationHistory (bağlam sürekliliği)", () => {
  test("boş hedef + renderer geçmişi → tohumlar ({role,content})", () => {
    const target = [];
    const n = seedConversationHistory(target, [
      { role: "user", text: "Konya hava durumu nasıl?" },
      { role: "assistant", text: "Konya'da bugün açık." },
      { role: "user", text: "ya yarın?" },
    ], 12);
    expect(n).toBe(3);
    expect(target).toEqual([
      { role: "user", content: "Konya hava durumu nasıl?" },
      { role: "assistant", content: "Konya'da bugün açık." },
      { role: "user", content: "ya yarın?" },
    ]);
  });

  test("hedef DOLUYSA tohumlanmaz (oturum-içi tekrarı önle)", () => {
    const target = [{ role: "user", content: "mevcut" }];
    const n = seedConversationHistory(target, [{ role: "user", text: "X" }], 12);
    expect(n).toBe(0);
    expect(target.length).toBe(1);
  });

  test("content alanı da kabul edilir; boş/role'süz atlanır", () => {
    const target = [];
    const n = seedConversationHistory(target, [
      { role: "user", content: "var" },
      { role: "system", content: "atlanmalı" },
      { role: "assistant", text: "  " },
    ], 12);
    expect(n).toBe(1);
    expect(target[0]).toEqual({ role: "user", content: "var" });
  });

  test("max ile son N tura kırpılır", () => {
    const incoming = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}` }));
    const target = [];
    seedConversationHistory(target, incoming, 6);
    expect(target.length).toBe(6);
    expect(target[target.length - 1].content).toBe("m19");
  });

  test("geçersiz girdiler güvenli", () => {
    expect(seedConversationHistory(null, [], 12)).toBe(0);
    expect(seedConversationHistory([], null, 12)).toBe(0);
    expect(seedConversationHistory([], [], 12)).toBe(0);
  });
});
