"use strict";

// Selamlaşmalar modele GİTMEDEN anında yanıtlanmalı ("Günaydın" 4B'de asılıyordu).
const { fastPathAnswer, greetingAnswer } = require("../../phoenix-core/intent/fast-path");

describe("fast-path selamlaşmalar", () => {
  const cases = [
    "Günaydın", "günaydın", "GÜNAYDIN",
    "İyi günler", "iyi akşamlar", "İyi geceler",
    "Merhaba", "selam", "slm",
    "Nasılsın?", "naber",
    "teşekkürler", "sağol", "eyvallah",
    "görüşürüz", "iyi çalışmalar",
  ];
  test.each(cases)("'%s' fast-path ile yanıtlanır (modelsiz)", (input) => {
    const r = fastPathAnswer(input);
    expect(r.hit).toBe(true);
    expect(r.intent).toBe("chat.greeting");
    expect(r.answer.length).toBeGreaterThan(0);
  });

  test("teknik soru fast-path'e TAKILMAZ", () => {
    expect(fastPathAnswer("npm workspaces hoisting nasıl engellenir?").hit).toBe(false);
    expect(greetingAnswer("gunaydin millet bugun ne yapalim")).toBe(""); // selam-içeren ama selam-olmayan
  });
});
