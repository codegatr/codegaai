"use strict";

/**
 * hard-gate-restore.test.js — Hard Gate bloke ettiğinde gerçek cevabı gizlememe
 *
 * Bug: tek-soruluk açık-uçlu danışma soruları ("nasıl/açıkla/analiz", örn.
 * tedarik-zinciri güvenlik sorusu) shouldVerifyAnswer'ı tetikleyip Hard Gate'e
 * girer; gate'in sezgileri kesin "Final Answer:" olmayan cevabı yanlış-reddedip
 * "Yanıt güvenli şekilde doğrulanamadı" duvarıyla gizliyordu. restoreBlockedAnswer:
 * dolu bir cevap varsa onu kısa bir uyarıyla gösterir (gizlemez).
 */

const { restoreBlockedAnswer } = require("../../model-manager");

describe("restoreBlockedAnswer", () => {
  const longAnswer = "Statik analiz için pipeline'a Snyk/Socket entegre edilir ve overrides ile paket blacklist edilir. " +
    "node_modules altında process.env erişimi regex ile taranır.";

  test("bloke + dolu cevap → cevabı uyarıyla döndürür (gizlemez)", () => {
    const out = restoreBlockedAnswer({ hardGateBlocked: true, isMultiTask: false, preGateText: longAnswer });
    expect(out).toContain("Snyk");
    expect(out).toContain("blacklist");
    expect(out).toMatch(/tam doğrulayamadım/i);
  });

  test("bloke yoksa null (değişiklik yok)", () => {
    expect(restoreBlockedAnswer({ hardGateBlocked: false, isMultiTask: false, preGateText: longAnswer })).toBeNull();
  });

  test("çok-görevli akışta dokunmaz (multi-task kendi güvencesini kullanır)", () => {
    expect(restoreBlockedAnswer({ hardGateBlocked: true, isMultiTask: true, preGateText: longAnswer })).toBeNull();
  });

  test("boş/çok kısa cevapta gate mesajı korunur (null)", () => {
    expect(restoreBlockedAnswer({ hardGateBlocked: true, isMultiTask: false, preGateText: "" })).toBeNull();
    expect(restoreBlockedAnswer({ hardGateBlocked: true, isMultiTask: false, preGateText: "kısa" })).toBeNull();
  });
});
