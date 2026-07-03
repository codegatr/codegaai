"use strict";

// Kontrol Merkezi (ayarlar diyaloğu) sözleşmesi — alpha.100 denetimi:
// 1) renderer.js'in getElementById ile aradığı her "ov-*" elementi index.html'de
//    GERÇEKTEN var olmalı (ov-version/ov-memory/ov-ollama gibi ölü ID'ler tekrarlanmasın).
// 2) Genel Bakış kartları uydurma başlangıç değeri göstermemeli.
// 3) Ayar dışa aktarma, API anahtarı uyarısı içermeli.

const fs = require("node:fs");
const path = require("node:path");

const rendererDir = path.join(__dirname, "..", "..", "..", "renderer");
const html = fs.readFileSync(path.join(rendererDir, "index.html"), "utf8");
const js = fs.readFileSync(path.join(rendererDir, "renderer.js"), "utf8");

describe("Kontrol Merkezi: ov-* element sözleşmesi", () => {
  test("renderer'ın aradığı her literal ov-* ID'si index.html'de var", () => {
    const referenced = new Set();
    const re = /getElementById\(\s*"(ov-[a-z0-9-]+)"\s*\)/g;
    let m;
    while ((m = re.exec(js))) referenced.add(m[1]);
    expect(referenced.size).toBeGreaterThan(5); // sözleşme boş çalışmasın
    const missing = [...referenced].filter((id) => !html.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });

  test("kaldırılan ölü ID'lere referans geri gelmedi", () => {
    for (const dead of ['"ov-version"', '"ov-memory"', '"ov-ollama"']) {
      expect(js).not.toContain(`getElementById(${dead})`);
    }
  });

  test("yeni sağlık elemanları mevcut: geri bildirim, aktif ajan, ollama dot", () => {
    expect(html).toContain('id="ov-feedback"');
    expect(html).toContain('id="ov-health-agent"');
    expect(html).toContain('id="ov-health-ollama-dot"');
  });
});

describe("Kontrol Merkezi: uydurma başlangıç değeri yok", () => {
  test("'En Çok Model' kartı sabit model adıyla başlamaz", () => {
    expect(html).not.toMatch(/id="ov-model">qwen/);
    expect(html).toMatch(/id="ov-model">—</);
  });

  test("Ollama sağlık satırı denetim öncesi 'çalışıyor' iddia etmez", () => {
    expect(html).not.toMatch(/id="ov-health-ollama">çalışıyor</);
  });

  test("renderer ollama sağlık noktasını (dot) günceller", () => {
    expect(js).toContain('"ov-health-ollama-dot"');
  });

  test("aktif ajan satırı ayarlardaki uzman modundan beslenir", () => {
    expect(js).toContain('set("ov-health-agent"');
    expect(js).toContain("expertMode");
  });
});

describe("Kontrol Merkezi: dışa aktarma ve sağlayıcı alanları", () => {
  test("ayar dışa aktarma API anahtarı uyarısı sorar", () => {
    expect(js).toMatch(/confirm\([^)]*API anahtarlar/);
  });

  test("sağlayıcı placeholder'ları seçili sağlayıcıya göre güncellenir", () => {
    expect(js).toContain("els.openaiModel.placeholder");
    expect(js).toContain("els.openaiBase.placeholder");
  });

  test("bulut sağlayıcı seçiliyken aktif model o sağlayıcının modelini gösterir", () => {
    expect(js).toContain("providerModelKeys");
    expect(js).toMatch(/provider !== "ollama" && cloudModel/);
  });
});

// Sağlayıcı bağlantı testi sonucu DİYALOĞUN İÇİNDE gösterilmeli (alpha.106):
// setTransientStatus ana sohbet rozetine yazar → Kontrol Merkezi açıkken görünmez.
describe("Kontrol Merkezi: bağlantı testi sonucu görünür", () => {
  test("provider-test-result öğesi HTML'de var", () => {
    expect(html).toContain('id="provider-test-result"');
  });
  test("test handler sonucu diyalog içi öğeye yazar (rozete değil)", () => {
    expect(js).toContain("showProviderTestResult");
    // test click handler'ı sonucu görünür alana yazmalı (setTransientStatus değil)
    const handler = js.slice(js.indexOf("els.providerTest.addEventListener"), js.indexOf("els.providerTest.addEventListener") + 700);
    expect(handler).toMatch(/showProviderTestResult/);
    expect(handler).not.toMatch(/setTransientStatus/);
  });
});
