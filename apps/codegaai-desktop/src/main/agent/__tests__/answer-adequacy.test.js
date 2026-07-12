"use strict";

/**
 * answer-adequacy.test.js — Uzun teknik soruya alakasız-kısa cevap ("6 TL") kapısı
 *
 * Codex teşhisi: uzun mimari soruya model "6 TL" gibi alakasız-kısa cevap
 * üretebiliyor ve deterministik cevaplayıcılar boş döndüğü için bu final olarak
 * gösteriliyordu. isIrrelevantShortAnswer bunu yakalar; git-status/benchmark/
 * smalltalk/matematik cevaplarını BOZMAZ.
 */

const a = require("../answer-adequacy");

const LONG_Q =
  "CODEGA AI, Project Brain güncellemesinde package.json ve inc/version.php dosyalarını " +
  "eşzamanlı güncellemem gerekiyor. Dosya kilidi (file lock) çakışması, atomic write ve " +
  "hata olursa rollback mantığını nasıl kurarım? 5 modül aynı sürüm numarasını paylaşıyor, " +
  "sürüm çakışması riski var.";

const SELF_REPAIR_Q =
  "CODEGA AI, ürettiğin kodun içinde ON JOIN veya yarım kalan bir c. alias'ı gördüğün an " +
  "hata vermek kolaycılıktır. Arka planda hangi mantıksal hatayı yaptığını Self-Reflection ile " +
  "analiz edip kodu düzeltmek için 1 sayfalık temiz bir mantık kurgulayabilir misin?";

describe("answer-adequacy — irrelevant short answer gate", () => {
  test("uzun mimari soru + '6 TL' → REJECT", () => {
    expect(a.isIrrelevantShortAnswer(LONG_Q, "6 TL")).toBe(true);
    expect(a.isIrrelevantShortAnswer(LONG_Q, "42")).toBe(true);
    expect(a.isIrrelevantShortAnswer(LONG_Q, "%50")).toBe(true);
  });

  test("uzun mimari soru + gerçek mimari cevap → OK", () => {
    const good = "Önce package.json ve version.php için preflight lock probe yap; temp dosyaya " +
      "yaz, atomic rename ile değiştir, doğrula. Hata olursa backup restore (rollback). " +
      "Dosya kilidinde exponential backoff + max attempt uygula.";
    expect(a.isIrrelevantShortAnswer(LONG_Q, good)).toBe(false);
  });

  test("kısa matematik sorusunu BOZMAZ ('2+2' → '4')", () => {
    expect(a.isIrrelevantShortAnswer("2+2 kaç eder?", "4")).toBe(false);
  });

  test("git-status kısa komut cevabını BOZMAZ", () => {
    expect(a.isIrrelevantShortAnswer("git durumu, sadece komut", "git status")).toBe(false);
  });

  test("benchmark cevabını BOZMAZ ('6 inek kaldı')", () => {
    expect(a.isIrrelevantShortAnswer("Bir çiftçinin 20 ineği vardı. 6'sı hariç hepsi öldü. Kaç ineği kaldı?", "6 inek kaldı.")).toBe(false);
  });

  test("smalltalk cevabını BOZMAZ", () => {
    expect(a.isIrrelevantShortAnswer("merhaba", "Merhaba. Buradayım, nasıl yardımcı olayım?")).toBe(false);
  });

  test("kısa teknik soru ('monorepo nedir?') yanlış-pozitif vermez", () => {
    expect(a.isLongTechnicalQuestion("monorepo nedir?")).toBe(false);
  });

  test("uzun soru tespiti: >250 char veya 2+ mimari sinyal + >120 char", () => {
    expect(a.isLongTechnicalQuestion(LONG_Q)).toBe(true);
    expect(a.technicalSignals(LONG_Q).length).toBeGreaterThanOrEqual(2);
  });

  test("focused regen mesajı ve kontrollü mesaj mevcut", () => {
    const msgs = a.buildFocusedRegenMessages(LONG_Q);
    expect(msgs[msgs.length - 1].content).toContain("package.json");
    expect(a.CONTROLLED_RETRY_MESSAGE).toMatch(/küçük parçalara/i);
  });

  test("açık self-repair tasarımı yerine seçenek soran cevabı reddeder", () => {
    const deflection = "Önce sadece mantığın nasıl çalışacağını açıklayayım mı, yoksa doğrudan Python örneği mi sunayım? Hangisini tercih edersiniz?";
    expect(a.isDeflectingClarification(SELF_REPAIR_Q, deflection)).toBe(true);
    expect(a.isIrrelevantShortAnswer(SELF_REPAIR_Q, deflection)).toBe(true);

    const good = "Akış önce stream çıktısını karantinaya alır; ON JOIN kusurunu teşhis eder, orijinal niyeti koruyan onarım prompt'u ile yeniden üretir ve syntax doğrulamasından geçirir.";
    expect(a.isDeflectingClarification(SELF_REPAIR_Q, good)).toBe(false);
    expect(a.isIrrelevantShortAnswer(SELF_REPAIR_Q, good)).toBe(false);
  });
});
