"use strict";

// Kademeli (insane-search tarzı) public-içerik çekme katmanının testleri.
// Ağ yok: global.fetch mock'lanır.

const { fetchTextResilient, _looksThin, _AUTH_WALL_RE } = require("../tools");

function mockFetchByUrl(map) {
  // map: (url) => { status, body }
  global.fetch = jest.fn(async (url) => {
    const r = map(String(url));
    return { status: r.status, text: async () => r.body };
  });
}

const LONG = "İçerik ".repeat(80); // > 200 karakter düz metin

afterEach(() => { delete global.fetch; jest.clearAllMocks(); });

describe("fetchTextResilient", () => {
  test("geçersiz URL reddedilir", async () => {
    await expect(fetchTextResilient("ftp://x")).rejects.toThrow(/http/i);
  });

  test("T1 (doğrudan) dolu içerik dönerse onu kullanır", async () => {
    mockFetchByUrl(() => ({ status: 200, body: `<p>${LONG}</p>` }));
    const res = await fetchTextResilient("https://example.com");
    expect(res.via).toBe("doğrudan");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("T1/T2 ince ise reader (r.jina.ai) son çareye düşer", async () => {
    mockFetchByUrl((url) => {
      if (url.includes("r.jina.ai")) return { status: 200, body: LONG };
      return { status: 200, body: "<p>kısa</p>" }; // ince
    });
    const res = await fetchTextResilient("https://example.com/article");
    expect(res.via).toBe("reader");
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[2][0]).toContain("r.jina.ai");
  });

  test("login/paywall işareti görülürse yükseltmeden hata verir", async () => {
    mockFetchByUrl((url) => {
      if (url.includes("r.jina.ai")) return { status: 200, body: LONG };
      return { status: 200, body: `<div>Please log in to continue reading</div>` };
    });
    await expect(fetchTextResilient("https://paywalled.example/x")).rejects.toThrow(/kimlik doğrulama|paywall/i);
    expect(global.fetch).toHaveBeenCalledTimes(1); // auth görülünce reader'a yükseltmez
  });

  test("tüm yollar başarısızsa hata fırlatır", async () => {
    mockFetchByUrl(() => ({ status: 503, body: "" }));
    await expect(fetchTextResilient("https://down.example")).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

describe("yardımcılar", () => {
  test("looksThin: kısa içerik ince, uzun içerik değil", () => {
    expect(_looksThin("<p>az</p>")).toBe(true);
    expect(_looksThin(`<p>${LONG}</p>`)).toBe(false);
  });

  test("AUTH_WALL_RE: login/paywall kalıplarını yakalar", () => {
    expect(_AUTH_WALL_RE.test("Sign in to continue")).toBe(true);
    expect(_AUTH_WALL_RE.test("Subscribe to read the full story")).toBe(true);
    expect(_AUTH_WALL_RE.test("giriş yap ve devam et")).toBe(true);
    expect(_AUTH_WALL_RE.test("normal bir haber metni")).toBe(false);
  });
});
