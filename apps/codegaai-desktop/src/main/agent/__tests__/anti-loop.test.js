"use strict";

const { collapseRepetition, detectRunawayRepetition } = require("../anti-loop");

describe("anti-loop: tekrar/döngü temizliği", () => {
  test("aynı uzun cümlenin defalarca tekrarını tek kopyaya indirir", () => {
    const loop = "En kötümser durumda elimizde üç farklı renk vardır ve dördüncü top mutlaka eşleşir. " +
      "En kötümser durumda elimizde üç farklı renk vardır ve dördüncü top mutlaka eşleşir. " +
      "En kötümser durumda elimizde üç farklı renk vardır ve dördüncü top mutlaka eşleşir.";
    const out = collapseRepetition(loop);
    const occ = (out.match(/dördüncü top mutlaka eşleşir/g) || []).length;
    expect(occ).toBe(1);
  });

  test("detectRunawayRepetition kaçak tekrarı yakalar", () => {
    const s = "Bu cümle yeterince uzundur ve döngü halinde tekrar tekrar yazılmaktadır burada. ".repeat(3);
    expect(detectRunawayRepetition(s)).toBe(true);
    expect(detectRunawayRepetition("Tek seferlik normal bir cümle, tekrar yok.")).toBe(false);
  });

  test("kod bloklarına DOKUNMAZ (tekrar eden satırlar kod içinde korunur)", () => {
    const code = "İşte kod:\n```python\nx = 1\nx = 1\nprint(x)\n```\nBitti.";
    const out = collapseRepetition(code);
    expect(out).toContain("```python\nx = 1\nx = 1\nprint(x)\n```");
  });

  test("normal (tekrarsız) metni bozmaz", () => {
    const clean = "Cevap 4'tür. Çünkü üç renk vardır; dördüncü top kesinlikle bir renkle eşleşir.";
    expect(collapseRepetition(clean)).toBe(clean);
  });

  test("boş/whitespace güvenli", () => {
    expect(collapseRepetition("")).toBe("");
    expect(collapseRepetition("   ")).toBe("   ");
  });
});
