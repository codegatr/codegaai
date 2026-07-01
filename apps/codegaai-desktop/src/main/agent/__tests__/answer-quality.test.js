"use strict";

const { looksDegenerate } = require("../answer-quality");
const { ModelManager } = require("../../model-manager");

describe("answer-quality: bozuk cevap sezici", () => {
  test("boş cevap bozuktur", () => {
    expect(looksDegenerate("", "soru?").bad).toBe(true);
  });
  test("rol karışması (kendiyle konuşma) bozuktur", () => {
    const salad = "sizden ne bekleniyor acaba neredesiniz biz sizinle konusalim mi. " +
      "benim yanitimi bekliyorsunuz, hangi yolu izliyorsunuz?";
    expect(looksDegenerate(salad, "r10.net nedir?").bad).toBe(true);
  });
  test("tekrar/döngü bozuktur", () => {
    const loop = "Bu cümle yeterince uzundur ve döngü halinde tekrar tekrar yazilmaktadir burada. ".repeat(3);
    expect(looksDegenerate(loop, "x").bad).toBe(true);
  });
  test("karakter salatası (emoji/unicode/klavye ezmesi) bozuktur", () => {
    const salad = "# BAŞLIK 🔥🔩✨✍️✈️⚙️❗✅☝️😎πφδμλΣΩαβγδΑΒΓΔΕqwertyuiopasdfgjhkldfzxcsedcrfvbgtnhy metal";
    expect(looksDegenerate(salad).reason).toBe("char_salad");
  });
  test("normal, temiz cevap bozuk DEĞİL (birkaç emoji dahil)", () => {
    expect(looksDegenerate("Cevap 4'tür; üç renk olduğundan dördüncü top kesin eşleşir.", "kaç top?").bad).toBe(false);
    expect(looksDegenerate("Merhaba! 😊 Bugün nasıl yardımcı olabilirim? 🔎", "selam").bad).toBe(false);
  });
});

describe("askDirect öz-düzeltme akışı", () => {
  test("bozuk ilk cevap → düzeltici retry ile düzelir (source: direct_selfcorrected)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let call = 0;
    mgr.generate = async () => {
      call += 1;
      // 1. üretim bozuk (rol karışması), 2. üretim temiz
      return call === 1
        ? "benim yanitimi bekliyorsunuz, sizden ne bekleniyor, hangi yolu izliyorsunuz?"
        : "R10.net, Türkiye'de bir webmaster ve dijital pazarlama topluluğudur.";
    };
    const res = await mgr.askDirect("r10 nedir", { chatId: "sc1" });
    expect(call).toBe(2);
    expect(res.source).toBe("direct_selfcorrected");
    expect(res.text).toMatch(/webmaster/i);
  });

  test("temiz ilk cevap → retry YOK (source: direct)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let call = 0;
    mgr.generate = async () => { call += 1; return "Merhaba! Sana nasıl yardımcı olabilirim?"; };
    const res = await mgr.askDirect("selam", { chatId: "sc2" });
    expect(call).toBe(1);
    expect(res.source).toBe("direct");
  });
});
