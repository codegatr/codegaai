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
  test("SQL syntax salatasi bozuktur", () => {
    const broken = [
      "WITH customer_stats AS (",
      "  SELECT c.customer_id, c.name, SUM(t.amount) toplam_borc",
      "  FROM customers_c ON JOIN(c.curi_did=t.customer_id)",
      "  WHERE c.",
      ") SELECT * FROM customer_stats;",
    ].join("\n");
    expect(looksDegenerate(broken, "Drew Karavan vade analizi SQL").reason).toBe("sql_syntax_salad");
  });
  test("temiz finans CTE SQL bozuk sayilmaz", () => {
    const clean = [
      "WITH customer_stats AS (",
      "  SELECT c.customer_id, c.name, SUM(CASE WHEN t.direction = 'debit' THEN t.amount ELSE 0 END) AS toplam_borc",
      "  FROM customers c",
      "  JOIN transactions t ON t.customer_id = c.customer_id",
      "  GROUP BY c.customer_id, c.name",
      ")",
      "SELECT customer_id, name, toplam_borc FROM customer_stats;",
    ].join("\n");
    expect(looksDegenerate(clean, "Drew Karavan vade analizi SQL").bad).toBe(false);
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

describe("askDirect SQL syntax recovery", () => {
  test("kirik finans SQL'i retry ile temiz SQL'e toparlar", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3.5:4b"];
    let call = 0;
    mgr.generate = async () => {
      call += 1;
      return call === 1
        ? "WITH customer_stats AS (SELECT c.customer_id FROM customers_c ON JOIN(c.curi_did=t.customer_id) WHERE c.) SELECT * FROM customer_stats;"
        : [
          "WITH customer_stats AS (",
          "  SELECT c.customer_id, c.name, SUM(CASE WHEN t.direction = 'debit' THEN t.amount ELSE 0 END) AS toplam_borc",
          "  FROM customers c",
          "  JOIN transactions t ON t.customer_id = c.customer_id",
          "  GROUP BY c.customer_id, c.name",
          ")",
          "SELECT customer_id, name, toplam_borc FROM customer_stats;",
        ].join("\n");
    };
    const res = await mgr.askDirect("Drew Karavan icin SQL vade analizi yaz", { chatId: "sc-sql" });
    expect(call).toBe(2);
    expect(res.source).toBe("direct_selfcorrected");
    expect(res.text).toMatch(/JOIN transactions t ON/);
    expect(res.text).not.toMatch(/ON JOIN|WHERE c\./);
  });
});
