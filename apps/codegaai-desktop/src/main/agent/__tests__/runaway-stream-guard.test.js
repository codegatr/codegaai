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

afterEach(() => { delete global.fetch; jest.clearAllMocks(); });

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
    expect(res.text).toMatch(/daha güçlü bir bulut modeli/);
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
});
