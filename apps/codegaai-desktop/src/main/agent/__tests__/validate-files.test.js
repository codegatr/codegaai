"use strict";

const { validateFiles, isModuleSyntaxError } = require("../../services/executor/validate-files");

describe("validate-files (ZIP öncesi syntax gate)", () => {
  test("geçerli JSON/JS uyarı üretmez", async () => {
    const r = await validateFiles([
      { path: "config.json", content: '{"a":1,"b":[2,3]}' },
      { path: "app.js", content: "function f(x){ return x+1; }\nconst y = f(2);" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  test("bozuk JSON → uyarı (bloklamaz)", async () => {
    const r = await validateFiles([{ path: "bad.json", content: "{ a: 1, }" }]);
    expect(r.ok).toBe(false);
    expect(r.warnings[0].path).toBe("bad.json");
    expect(r.warnings[0].error).toMatch(/JSON/);
  });

  test("bozuk JS syntax → uyarı", async () => {
    const r = await validateFiles([{ path: "broken.js", content: "function ( { return" }]);
    expect(r.ok).toBe(false);
    expect(r.warnings[0].error).toMatch(/JS syntax/);
  });

  test("ESM import/export YANLIŞ-POZİTİF üretmez", async () => {
    const r = await validateFiles([
      { path: "mod.mjs", content: "import x from 'y';\nexport const z = 1;" },
    ]);
    expect(r.ok).toBe(true);
  });

  test("bilinmeyen uzantı atlanır (uyarı yok)", async () => {
    const r = await validateFiles([{ path: "readme.md", content: "# başlık ((((" }]);
    expect(r.ok).toBe(true);
  });

  test("isModuleSyntaxError import/export'u tolere olarak işaretler", () => {
    expect(isModuleSyntaxError(new Error("Cannot use import statement outside a module"))).toBe(true);
    expect(isModuleSyntaxError(new Error("Unexpected token }"))).toBe(false);
  });
});
