"use strict";

/**
 * builder-engine.test.js
 *
 * BuilderEngine'in preview() ve build() fonksiyonlarını test eder.
 * Electron bağımlılığı yok — saf Node.js ortamında çalışır.
 */

const path = require("node:path");
const os   = require("node:os");
const fsp  = require("node:fs/promises");

const { preview, build, STACKS } = require("../builder/builder-engine");

// ── Yardımcılar ──────────────────────────────────────────────────

function makeSpec(type, overrides = {}) {
  return {
    type,
    name: "test-project",
    features: ["auth", "docker"],
    database: "mysql",
    description: "Jest test projesi",
    ...overrides,
  };
}

// ── STACKS listesi ───────────────────────────────────────────────

describe("STACKS", () => {
  test("6 stack tanımlı olmalı", () => {
    expect(Object.keys(STACKS)).toHaveLength(6);
  });

  test("her stack id, label ve description alanına sahip olmalı", () => {
    for (const [id, s] of Object.entries(STACKS)) {
      expect(typeof id).toBe("string");
      expect(s).toHaveProperty("label");
      expect(s).toHaveProperty("description");
    }
  });

  test("beklenen stack id'leri mevcut olmalı", () => {
    const ids = Object.keys(STACKS);
    expect(ids).toEqual(
      expect.arrayContaining(["laravel", "express", "react", "vue", "nextjs", "flutter"])
    );
  });
});

// ── preview() ────────────────────────────────────────────────────

describe("preview()", () => {
  test("geçersiz stack için hata fırlatmalı", () => {
    expect(() => preview(makeSpec("geçersiz-stack"))).toThrow();
  });

  for (const [id] of Object.entries(STACKS)) {
    test(`${id}: dosya ağacı döndürmeli`, () => {
      const result = preview(makeSpec(id));
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.fileCount).toBe(result.files.length);
    });

    test(`${id}: her dosya yolu string olmalı`, () => {
      const { files } = preview(makeSpec(id));
      for (const f of files) {
        expect(typeof f).toBe("string");
        expect(f.length).toBeGreaterThan(0);
      }
    });

    test(`${id}: .gitignore içermeli`, () => {
      const { files } = preview(makeSpec(id));
      expect(files.some((p) => p.includes(".gitignore"))).toBe(true);
    });

    test(`${id}: README.md içermeli`, () => {
      const { files } = preview(makeSpec(id));
      expect(files.some((p) => p.toLowerCase().includes("readme"))).toBe(true);
    });

    test(`${id}: docker özelliği istendiğinde Docker dosyası üretmeli`, () => {
      // Flutter mobil framework — Docker uygulanamaz, bu stack'i atla
      if (id === "flutter") return;
      const { files } = preview(makeSpec(id, { features: ["docker"] }));
      expect(
        files.some((p) => p.includes("Dockerfile") || p.includes("docker-compose"))
      ).toBe(true);
    });
  }
});

// ── preview() — proje adı yansıması ─────────────────────────────

describe("preview() — proje adı", () => {
  test("proje adı üretilen dosya ağacında yansımalı", () => {
    const result = preview(makeSpec("express", { name: "my-api" }));
    expect(result.name).toBe("my-api");
    expect(result.stack).toBe("express");
  });

  test("Türkçe proje adı slug'a çevrilmeli (hata vermemeli)", () => {
    expect(() => preview(makeSpec("react", { name: "Türkçe Proje Adı" }))).not.toThrow();
  });
});

// ── build() — ZIP oluşturma ──────────────────────────────────────

describe("build()", () => {
  let tmpDir;

  beforeAll(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "codega-build-test-"));
  });

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test("express stack için ZIP dosyası oluşturmalı", async () => {
    const result = await build(makeSpec("express"), tmpDir);
    expect(result).toHaveProperty("outPath");
    const stat = await fsp.stat(result.outPath);
    expect(stat.size).toBeGreaterThan(100);
  }, 15000);

  test("react stack için ZIP dosyası oluşturmalı", async () => {
    const result = await build(makeSpec("react"), tmpDir);
    expect(result).toHaveProperty("outPath");
    const stat = await fsp.stat(result.outPath);
    expect(stat.size).toBeGreaterThan(100);
  }, 15000);

  test("ZIP dosyası adı proje adını içermeli", async () => {
    const result = await build(makeSpec("vue", { name: "my-vue-app" }), tmpDir);
    expect(result.fileName).toMatch(/my-vue-app/);
  }, 15000);
});
