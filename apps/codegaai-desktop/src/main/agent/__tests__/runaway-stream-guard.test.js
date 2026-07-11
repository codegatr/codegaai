"use strict";

/**
 * runaway-stream-guard.test.js — kaçak üretim canlı kesici (alpha.101)
 *
 * Kullanıcı raporu: yerel model SQL şeması üretirken aynı bozuk bloğu
 * defalarca bastı ve "durdurmasam devam edecekti". İki boşluk kapatıldı:
 *  1) streamChatOnce: birikimde kaçak tekrar görülünce turu CANLI keser
 *     (doneReason:"runaway") — çöp dakikalarca akmaz.
 *  2) ollamaChatStream: devam (continuation) turları, birikim kaçak tekrar
 *     içeriyorsa atılmaz — döngü token tavanının ötesine uzatılmaz.
 *  3) askDirect: öz-düzeltme de bozuksa çöp AYNEN teslim edilmez; dürüst
 *     fallback mesajı döner.
 */

const { ollamaChatStream } = require("../ollama-client");
const { ModelManager } = require("../../model-manager");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setSettings } = require("../settings-store");

const enc = new TextEncoder();

// Dejenere üretimi temsil eden dev satır (normalize uzunluk >> 40).
const GIANT = "CREATE TABELA IF EXIST islemier idINTAUTOINCREMENTPRIMARYKEY cari_IDintNOTNULL " +
  "FOREIGN KEY carilers id ON DELETE CASCADE ISLEM_TURIENUM BURC Alacak MIKTARDECIM " +
  "ACIKLAMAVARCHAR MAX NULL ISEMTARTIHI DATETIMECURRENT_TIMESTAMPDEFAULT CURRENTTIMESTAMP " +
  "INDEX IDX_ISLERM_CARII islermi_carii ENGINE INNOBD comment ISER TABLOSU " +
  "ALTERTABLE CARILER ADD COLUMN BAKEYESUME DECIMAL SIGNSZER defaultOzeroDERIVE FROM SUM " +
  "BAYETURE CASE WHENBAKETUTRU borclu THEN ELSEWHENBAKERTURUALACLALI THENTHENSELDE ENDENDFROM ISLEMER";

function tokenLine(content) { return { message: { role: "assistant", content } }; }
function finalLine(reason) { return { done: true, done_reason: reason, message: { content: "" } }; }

// Abort'a saygılı akış: signal.aborted olduktan sonra read() AbortError fırlatır
// (gerçek fetch body davranışı). Canlı kesici testinin temeli.
function abortAwareStream(lines, signalRef) {
  const chunks = lines.map((o) => enc.encode(JSON.stringify(o) + "\n"));
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          read() {
            if (signalRef.signal && signalRef.signal.aborted) {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              return Promise.reject(err);
            }
            if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] });
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    },
  };
}

afterEach(() => {
  delete global.fetch;
  if (process.env.CODEGA_SETTINGS_PATH) {
    try { fs.rmSync(process.env.CODEGA_SETTINGS_PATH, { force: true }); } catch (_e) {}
    delete process.env.CODEGA_SETTINGS_PATH;
  }
  if (process.env.CODEGA_DIAGNOSTIC_LOG_PATH) {
    try { fs.rmSync(process.env.CODEGA_DIAGNOSTIC_LOG_PATH, { force: true }); } catch (_e) {}
    delete process.env.CODEGA_DIAGNOSTIC_LOG_PATH;
  }
  jest.clearAllMocks();
});

describe("streamChatOnce canlı kesici: tur içi kaçak tekrar", () => {
  test("aynı dev blok akarken kesilir; sonraki bloklar kullanıcıya akmaz", async () => {
    // 8 kez aynı dev satır — bozulmamış korumada hepsi akardı.
    const lines = [];
    for (let k = 0; k < 8; k++) lines.push(tokenLine(GIANT + "\n"));
    lines.push(finalLine("stop"));
    const signalRef = {};
    global.fetch = jest.fn(async (_url, opts) => {
      signalRef.signal = opts.signal;
      return abortAwareStream(lines, signalRef);
    });

    const tokens = [];
    const full = await ollamaChatStream("m", [{ role: "user", content: "şema yaz" }], {
      onToken: (t) => tokens.push(t),
    });

    // Kesici devreye girdi: 8 bloğun tamamı ASLA dönmez.
    const count = (full.match(/CREATE TABELA/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3); // tespit için en az 3 gerek
    expect(count).toBeLessThan(8);           // ama hepsi akmadı
    expect(global.fetch).toHaveBeenCalledTimes(1); // devam turu da yok
  });

  test("karakter salatasi baslarsa tetikleyen token kullaniciya akitilmaz", async () => {
    const salad = "ğŸ”¥ğŸ”©âœ¨âœï¸âœˆï¸âš™ï¸â—âœ…â˜ï¸ğŸ˜Ï€Ï†Î´Î¼Î»Î£Î©Î±Î²Î³Î´Î‘Î’Î“Î”Î•qwertyuiopasdfgjhkldfzxcsedcrfvbgtnhy";
    const lines = [
      tokenLine("Temiz baslangic. "),
      tokenLine(salad),
      tokenLine(" BU AKMAMALI"),
      finalLine("stop"),
    ];
    const signalRef = {};
    global.fetch = jest.fn(async (_url, opts) => {
      signalRef.signal = opts.signal;
      return abortAwareStream(lines, signalRef);
    });

    const tokens = [];
    const full = await ollamaChatStream("m", [{ role: "user", content: "uzun kod yaz" }], {
      onToken: (t) => tokens.push(t),
    });

    expect(full).toContain("Temiz baslangic");
    expect(full).toContain("qwertyuiop");
    expect(tokens.join("")).toBe("Temiz baslangic. ");
    expect(tokens.join("")).not.toContain("qwertyuiop");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("SQL structural guard ON JOIN akisini keser ve diagnostic log yazar", async () => {
    const logPath = path.join(os.tmpdir(), `codega-stream-${Date.now()}-${Math.random()}.jsonl`);
    process.env.CODEGA_DIAGNOSTIC_LOG_PATH = logPath;
    const brokenSql = "WITH customer_stats AS ( SELECT c.customer_id FROM customers_c ON JOIN(c.curi_did=t.customer_id) WHERE c. )";
    const lines = [
      tokenLine("Temiz SQL girisi. "),
      tokenLine(brokenSql),
      tokenLine(" BU AKMAMALI"),
      finalLine("stop"),
    ];
    const signalRef = {};
    global.fetch = jest.fn(async (_url, opts) => {
      signalRef.signal = opts.signal;
      return abortAwareStream(lines, signalRef);
    });

    const tokens = [];
    const full = await ollamaChatStream("m", [{ role: "user", content: "Drew Karavan finans SQL yaz" }], {
      onToken: (t) => tokens.push(t),
    });

    expect(full).toContain("ON JOIN");
    expect(tokens.join("")).toBe("Temiz SQL girisi. ");
    expect(tokens.join("")).not.toContain("ON JOIN");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const logText = fs.readFileSync(logPath, "utf8");
    expect(logText).toMatch(/sql_syntax_salad|dangling_alias|structural_error/);
    expect(logText).toMatch(/ON JOIN/);
  });
});

describe("ollamaChatStream devam koruması: turlar arası döngü", () => {
  test("her tur aynı bloğu basıp 'length' ile kesiliyorsa devam turları durdurulur", async () => {
    // Tur başına TEK dev blok (canlı kesicinin 1500 eşiğinin altında kalması
    // için tek token) + length → saf devam-korumasını izole test eder.
    const round = () => abortAwareStream([tokenLine(GIANT + "\n"), finalLine("length")], {});
    global.fetch = jest.fn(async () => round());

    const full = await ollamaChatStream("m", [{ role: "user", content: "şema" }], {});
    // 3. turdan sonra birikim kaçak tekrar sayılır → 4. tur atılmaz.
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect((full.match(/CREATE TABELA/g) || []).length).toBe(3);
  });
});

describe("askDirect: düzeltme de bozuksa çöp teslim edilmez", () => {
  test("iki üretim de dejenere → dürüst fallback mesajı, çöp değil", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    const garbage = (GIANT + "\n").repeat(6);
    let calls = 0;
    mgr.generate = async () => { calls += 1; return garbage; };

    const res = await mgr.askDirect("requestAnimationFrame nedir?", { chatId: "rg1" });

    expect(calls).toBe(2); // orijinal + tek düzeltme denemesi
    expect(res.source).toBe("direct_degenerate_fallback");
    expect(res.text).not.toMatch(/CREATE TABELA/);
    expect(res.text).toMatch(/durdurdum/);
    expect(res.text).toMatch(/gorevi bolmesini istememeli/);
    expect(res.text).toMatch(/\[SYSTEM LIMIT\]/);
    expect(res.text).not.toMatch(/kucuk parcalara|parcalara bol/i);
  });

  test("düzeltme başarılıysa davranış değişmez (regresyon)", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    const garbage = (GIANT + "\n").repeat(6);
    let calls = 0;
    mgr.generate = async () => { calls += 1; return calls === 1 ? garbage : "requestAnimationFrame, tarayıcının bir sonraki boyamadan önce çağırdığı callback'i planlar."; };

    const res = await mgr.askDirect("requestAnimationFrame nedir?", { chatId: "rg2" });
    expect(res.source).toBe("direct_selfcorrected");
    expect(res.text).toMatch(/requestAnimationFrame/);
  });

  test("yerel duzeltme de bozuksa yapilandirilmis bulut saglayici ile toparlar", async () => {
    process.env.CODEGA_SETTINGS_PATH = path.join(os.tmpdir(), `codega-settings-${Date.now()}-${Math.random()}.json`);
    setSettings({
      provider: "ollama",
      modelAutoFallback: true,
      modelFallbackOrder: ["ollama", "openai"],
      openaiApiKey: "test-key",
      openaiBaseUrl: "https://example.test/v1",
      openaiModel: "gpt-recovery",
    });
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes("/chat/completions")) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "requestAnimationFrame, tarayicinin bir sonraki boya dongusunden once callback planlamasini saglar." } }],
          }),
        };
      }
      return { ok: false, status: 500, text: async () => "" };
    });
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    const garbage = (GIANT + "\n").repeat(6);
    let calls = 0;
    mgr.generate = async () => { calls += 1; return garbage; };

    const res = await mgr.askDirect("requestAnimationFrame nedir?", { chatId: "rg3" });

    expect(calls).toBe(2);
    expect(res.source).toBe("direct_cloud_recovered");
    expect(res.model).toBe("openai:gpt-recovery");
    expect(res.text).toMatch(/requestAnimationFrame/);
    expect(res.text).not.toMatch(/CREATE TABELA/);
  });

  test("structural SQL hatasinda cloud varsa lokal retry beklemeden toparlar", async () => {
    process.env.CODEGA_SETTINGS_PATH = path.join(os.tmpdir(), `codega-settings-${Date.now()}-${Math.random()}.json`);
    setSettings({
      provider: "ollama",
      modelAutoFallback: true,
      modelFallbackOrder: ["ollama", "openai"],
      openaiApiKey: "test-key",
      openaiBaseUrl: "https://example.test/v1",
      openaiModel: "gpt-sql-recovery",
    });
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes("/chat/completions")) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "WITH customer_stats AS (SELECT c.customer_id FROM customers c JOIN transactions t ON t.customer_id = c.customer_id GROUP BY c.customer_id) SELECT * FROM customer_stats;" } }],
          }),
        };
      }
      return { ok: false, status: 500, text: async () => "" };
    });
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    let calls = 0;
    mgr.generate = async () => {
      calls += 1;
      return "WITH customer_stats AS (SELECT c.customer_id FROM customers_c ON JOIN(c.curi_did=t.customer_id) WHERE c.) SELECT * FROM customer_stats;";
    };

    const res = await mgr.askDirect("Drew Karavan icin SQL vade analizi yaz", { chatId: "rg-sql-cloud" });

    expect(calls).toBe(1);
    expect(res.source).toBe("direct_cloud_recovered");
    expect(res.model).toBe("openai:gpt-sql-recovery");
    expect(res.text).toMatch(/JOIN transactions t ON/);
    expect(res.text).not.toMatch(/ON JOIN|WHERE c\./);
  });

  test("dort-domain buyuk test bozulursa kullanicidan bolmesini istemez", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    const garbage = (GIANT + "\n").repeat(6);
    let calls = 0;
    mgr.generate = async () => { calls += 1; return garbage; };
    const prompt = [
      "1. Kurumsal Finans ve Raporlama Testi",
      "2. Mikro-Mimari ve Framework'suz Gelistirme Testi",
      "3. Donanim ve Uretim Entegrasyonu IoT / 3D Printing",
      "4. Dijital Pazarlama ve Marka Iletisimi",
      "Bunu yapamayacaksa ne yapayim? Zeki CODEGA AI nerede?",
    ].join("\n");

    const res = await mgr.askDirect(prompt, { chatId: "rg4" });

    expect(calls).toBe(2);
    expect(res.source).toBe("direct_degenerate_fallback");
    expect(res.text).not.toMatch(/CREATE TABELA/);
    expect(res.text).not.toMatch(/kucuk parcalara|parcalara bol/i);
    expect(res.text).toMatch(/tek butun/);
    expect(res.text).toMatch(/Bulut saglayici yoksa/);
  });
});
