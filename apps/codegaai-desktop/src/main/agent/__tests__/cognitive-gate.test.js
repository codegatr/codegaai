"use strict";

/**
 * cognitive-gate.test.js — Çok-görevli girdide doğrulama kapısının cevabı
 * GİZLEMEMESİ (false-block) regresyon testleri.
 *
 * Bug: 10 testlik mantık seti verildiğinde, tamamlanma (sacv) ve sanity (ssv)
 * sezgileri serbest-biçim cevapta yanlış-negatif verip "Yanıt güvenli şekilde
 * doğrulanamadı" diyerek tüm cevabı gizliyordu. Düzeltme: çok-görevli girdide
 * bu sezgisel aşamalar bloklamaz (cevap yine de gösterilir); tek soruda sıkı kalır.
 */

const kernel = require("../../cognitive/kernel/cognitive-kernel");

const MULTI_INPUT = [
  "Test 1 – Dikkat",
  "Bir çiftçinin 20 ineği vardı. 6'sı hariç hepsi öldü. Kaç ineği kaldı?",
  "Test 2 – Mantık",
  "Bir uçak Türkiye-İran sınırında düştü. Kazazedeler hangi ülkeye gömülür?",
  "Test 3 – Muhakeme",
  "Nilüferler her gün iki katına çıkıyor. Göl 40. günde doluyor. Dörtte üçü hangi gün?",
  "Test 4 – Matematik",
  "Bir sayı düşün. 5 ile çarp. 20 ekle. 5'e böl. Başlangıç sayısını çıkar. Sonuç?",
  "Test 5 – Saat",
  "Saat 03:15. Açı kaç derece?",
  "Test 6 – Kediler",
  "3 kedi. Her kedinin önünde 2, arkasında 2 kedi. Nasıl?",
  "Test 7 – Yüzde",
  "%25 zam, sonra %20 indirim. Son fiyat?",
  "Test 8 – Yarış",
  "İkinci sıradakini geçtin. Kaçıncısın?",
  "Test 9 – Kardeş",
  "Doktorun 3 kardeşi var. Her birinin 1 erkek kardeşi var. Kaç erkek kardeş?",
  "Test 10 – Top",
  "10 kırmızı 10 mavi 10 yeşil. En az kaç top?",
].join("\n");

const RUN_ON_ANSWER =
  "Test 1: 6. Test 2: gomulmez. Test 3: 39. gun. Test 4: 4. Test 5: 7.5 derece. " +
  "Test 6: 3 kedi daire olusturur. Test 7: Ayni kalir. Test 8: Ikinci. " +
  "Test 9: 1 erkek kardes. Test 10: 4 top.";

const MULTILINE_ANSWER = [
  "Test 1: 6", "Test 2: Kazazedeler gomulmez", "Test 3: 39. gun", "Test 4: 4",
  "Test 5: 7.5 derece", "Test 6: daire olusturur", "Test 7: Ayni kalir",
  "Test 8: Ikinci", "Test 9: 1 erkek kardes", "Test 10: 4 top",
].join("\n");

const BLOCK_MARKER = "güvenli şekilde doğrulanamadı";

async function runGate(input, answer) {
  const ctx = kernel.createContext(input);
  kernel.runIntake(ctx);
  const res = await kernel.runPostValidation(ctx, answer, {
    needsVerification: false, deepReasoning: false, generate: null,
  });
  return { ctx, res };
}

describe("cognitive gate — multi-task false-block protection", () => {
  test("10-görev tespit edilir (applicable, count=10)", () => {
    const ctx = kernel.createContext(MULTI_INPUT);
    kernel.runIntake(ctx);
    expect(ctx.taskReport.applicable).toBe(true);
    expect(ctx.taskReport.count).toBe(10);
  });

  test("run-on (tek satır) cevap GİZLENMEZ", async () => {
    const { ctx, res } = await runGate(MULTI_INPUT, RUN_ON_ANSWER);
    expect(res.answer).not.toContain(BLOCK_MARKER);
    expect(res.answer).toContain("4 top");
    expect(ctx.blocked).toBe(false);
  });

  test("multiline cevap GİZLENMEZ", async () => {
    const { ctx, res } = await runGate(MULTI_INPUT, MULTILINE_ANSWER);
    expect(res.answer).not.toContain(BLOCK_MARKER);
    expect(ctx.blocked).toBe(false);
  });

  test("çok-görevli sanity (ssv) ve tamamlanma (sacv) bloklamaz", async () => {
    const { ctx } = await runGate(MULTI_INPUT, RUN_ON_ANSWER);
    const ssv = ctx.stages.find((s) => s.name === "ssv:supreme-sanity");
    const sacv = ctx.stages.find((s) => s.name === "sacv:semantic-completeness");
    // Aşama 'failed' olsa bile context.blocked tetiklenmemeli (non-blocking).
    expect(ctx.blocked).toBe(false);
    expect(ssv).toBeDefined();
    expect(sacv).toBeDefined();
  });

  test("model per-test reasoning + tek 'Final Answer:' yazsa bile cevaplar ÇÖKMEZ", async () => {
    // Bug: model her test için akıl yürütüp sonda tek "Final Answer: 3 kedi"
    // yazınca, finalAnswerText yalnız son bloğu alıp 10 cevaptan 9'unu siliyordu.
    const raw = [
      "Test 1: 6'si haric hepsi oldu, 6 kaldi.",
      "Test 2: Kazazedeler saglardir, gomulmez.",
      "Test 3: 39. gun.",
      "Test 4: 4.",
      "Test 5: 7.5 derece.",
      "Test 6: Uc kedi cember olusturur; cevap 3 kedidir.",
      "Test 7: Ayni kalir.",
      "Test 8: Ikinci.",
      "Test 9: 1 erkek kardes.",
      "Test 10: 4 top.",
      "Final Answer: 3 kedi",
    ].join("\n");
    const { res } = await runGate(MULTI_INPUT, raw);
    for (const needle of ["6 kaldi", "gomulmez", "39", "7.5 derece", "3 kedi", "Ayni kalir", "4 top"]) {
      expect(res.answer).toContain(needle);
    }
  });

  test("tek soru girdisinde sanity kapısı sıkı kalır (applicable=false)", () => {
    const ctx = kernel.createContext("2+2 kaç eder?");
    kernel.runIntake(ctx);
    // applicable=false → ssv blocking=true (sıkılık korunur)
    expect(ctx.taskReport.applicable).toBe(false);
  });
});
