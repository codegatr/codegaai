"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const store = require("../indexer/atomic-json-store");
const jsonl = require("../indexer/jsonl-chunk-store");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-store-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("atomic-json-store", () => {
  const p = () => path.join(dir, "project-brain.json");

  test("yaz + oku; .bak önceki sağlamı korur", () => {
    store.writeJson(p(), { v: 1, name: "İlk" });
    store.writeJson(p(), { v: 2, name: "İkinci" });
    expect(fs.existsSync(`${p()}.bak`)).toBe(true);
    const bak = JSON.parse(fs.readFileSync(`${p()}.bak`, "utf8"));
    expect(bak.v).toBe(1); // .bak = önceki sağlam
    expect(store.readJsonSafe(p()).data.v).toBe(2);
  });

  test("primary corrupt → .bak fallback (corrupt JSON fallback)", () => {
    store.writeJson(p(), { good: true });
    store.writeJson(p(), { good: true, gen: 2 }); // .bak oluşur
    fs.writeFileSync(p(), "{ yarim yazma", "utf8"); // primary'yi boz
    const r = store.readJsonSafe(p());
    expect(r.ok).toBe(true);
    expect(r.source).toBe("backup");
  });

  test("her ikisi de bozuksa ok:false (istisna fırlatmaz)", () => {
    fs.writeFileSync(p(), "xx", "utf8");
    fs.writeFileSync(`${p()}.bak`, "yy", "utf8");
    const r = store.readJsonSafe(p());
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe("string");
  });

  test("partial write retry: readJsonStable bozuk→düzelen dosyayı okur", async () => {
    fs.writeFileSync(p(), "{ half", "utf8"); // yarım
    // 120ms sonra tamamla
    setTimeout(() => store.writeJson(p(), { done: true }), 120);
    const r = await store.readJsonStable(p(), { retries: 6, delayMs: 60 });
    expect(r.ok).toBe(true);
    expect(r.data.done).toBe(true);
  });

  test("waitForStableFile: değişen dosyada false, sabit dosyada true", async () => {
    store.writeJson(p(), { a: 1 });
    expect(await store.waitForStableFile(p(), { retries: 3, delayMs: 20 })).toBe(true);
  });
});

describe("jsonl-chunk-store", () => {
  const p = () => path.join(dir, "chunks.jsonl");

  test("append + readAll; UTF-8 korunur", () => {
    jsonl.appendRecord(p(), { id: 1, t: "Türkçe çğşöü" });
    jsonl.appendRecord(p(), { id: 2, t: "İkinci" });
    const r = jsonl.readAll(p());
    expect(r.records.length).toBe(2);
    expect(r.records[0].t).toBe("Türkçe çğşöü");
    expect(r.skipped).toBe(0);
  });

  test("corrupt JSONL line skip: bozuk satır store'u çökertmez", () => {
    jsonl.appendRecord(p(), { id: 1 });
    fs.appendFileSync(p(), "{ bu satir bozuk\n", "utf8");
    jsonl.appendRecord(p(), { id: 3 });
    const r = jsonl.readAll(p());
    expect(r.records.map((x) => x.id)).toEqual([1, 3]);
    expect(r.skipped).toBe(1);
    expect(r.corruptLines).toEqual([2]);
  });

  test("compact bozuk satırları atar", () => {
    jsonl.appendRecord(p(), { id: 1 });
    fs.appendFileSync(p(), "bozuk\n", "utf8");
    jsonl.appendRecord(p(), { id: 2 });
    const c = jsonl.compact(p());
    expect(c.kept).toBe(2);
    expect(c.removed).toBe(1);
    expect(jsonl.readAll(p()).skipped).toBe(0);
  });

  test("olmayan dosya boş sonuç", () => {
    expect(jsonl.readAll(path.join(dir, "yok.jsonl")).records).toEqual([]);
  });
});
