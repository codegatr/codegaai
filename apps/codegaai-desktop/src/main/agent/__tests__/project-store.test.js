"use strict";

/**
 * project-store.test.js
 *
 * ProjectStore CRUD operasyonlarını test eder.
 * Electron bağımlılığı yok — saf Node.js/fs ortamında çalışır.
 */

const path = require("node:path");
const os   = require("node:os");
const fsp  = require("node:fs/promises");

const { ProjectStore } = require("../memory/project-store");

// ── scaffold() ───────────────────────────────────────────────────

describe("ProjectStore.scaffold()", () => {
  test("gerekli alanları içeren nesne döndürmeli", () => {
    const p = ProjectStore.scaffold("Test Projesi");
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("name", "Test Projesi");
    expect(p).toHaveProperty("brain");
    expect(p).toHaveProperty("createdAt");
    expect(p.id).toMatch(/^proj_[a-f0-9]{12}$/);
  });

  test("brain tüm kategorileri içermeli", () => {
    const p = ProjectStore.scaffold("X");
    const cats = ["architecture","tech_stack","business_rules","naming","schema","decisions","tech_debt","pending_work","release_history","known_bugs","standards"];
    for (const cat of cats) {
      expect(p.brain).toHaveProperty(cat);
      expect(Array.isArray(p.brain[cat])).toBe(true);
    }
  });

  test("Türkçe isim slug'a çevrilmeli", () => {
    const p = ProjectStore.scaffold("Türkçe Proje İsmi");
    expect(p.slug).toMatch(/^[a-z0-9-]+$/);
    expect(p.slug).not.toMatch(/[çğışöü]/i);
  });

  test("stack ve repoUrl opsiyonları yansımalı", () => {
    const p = ProjectStore.scaffold("API", { stack: "express", repoUrl: "github.com/x/y" });
    expect(p.stack).toBe("express");
    expect(p.repoUrl).toBe("github.com/x/y");
  });

  test("her çağrıda benzersiz id üretmeli", () => {
    const ids = new Set(Array.from({ length: 20 }, () => ProjectStore.scaffold("X").id));
    expect(ids.size).toBe(20);
  });
});

// ── ProjectStore CRUD ─────────────────────────────────────────────

describe("ProjectStore CRUD", () => {
  let baseDir;
  let store;

  beforeEach(async () => {
    baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "codega-proj-store-"));
    store = new ProjectStore(baseDir);
  });

  afterEach(async () => {
    await fsp.rm(baseDir, { recursive: true, force: true }).catch(() => {});
  });

  test("boş dizinde list() boş dizi döndürmeli", async () => {
    const result = await store.list();
    expect(result).toEqual([]);
  });

  test("save() + get() çalışmalı", async () => {
    const project = ProjectStore.scaffold("E-Ticaret");
    await store.save(project);
    const loaded = await store.get(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded.id).toBe(project.id);
    expect(loaded.name).toBe("E-Ticaret");
  });

  test("olmayan id için get() null döndürmeli", async () => {
    const result = await store.get("proj_nonexistent");
    expect(result).toBeNull();
  });

  test("save() updatedAt güncellenmeli", async () => {
    const project = ProjectStore.scaffold("Test");
    const before = Date.now();
    await store.save(project);
    const loaded = await store.get(project.id);
    expect(loaded.updatedAt).toBeGreaterThanOrEqual(before);
  });

  test("save() id olmayan proje hata fırlatmalı", async () => {
    await expect(store.save({ name: "No ID" })).rejects.toThrow();
  });

  test("list() kaydedilen projeyi göstermeli", async () => {
    const p1 = ProjectStore.scaffold("Proje 1");
    const p2 = ProjectStore.scaffold("Proje 2");
    await store.save(p1);
    await store.save(p2);
    const list = await store.list();
    expect(list).toHaveLength(2);
    const ids = list.map((x) => x.id);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
  });

  test("delete() projeyi silmeli", async () => {
    const project = ProjectStore.scaffold("Silinecek");
    await store.save(project);
    const deleted = await store.delete(project.id);
    expect(deleted).toBe(true);
    const result = await store.get(project.id);
    expect(result).toBeNull();
  });

  test("olmayan projeyi silmek false döndürmeli (hata değil)", async () => {
    const result = await store.delete("proj_nonexistent");
    expect(result).toBe(false);
  });

  test("brain güncelleme persist edilmeli", async () => {
    const project = ProjectStore.scaffold("API Projesi");
    project.brain.architecture.push({ note: "Monorepo yapısı", addedAt: Date.now() });
    await store.save(project);

    // Cache temizle — diskten oku
    store.clearCache();
    const loaded = await store.get(project.id);
    expect(loaded.brain.architecture).toHaveLength(1);
    expect(loaded.brain.architecture[0].note).toBe("Monorepo yapısı");
  });

  test("birden fazla proje birbirine karışmamalı", async () => {
    const p1 = ProjectStore.scaffold("Proje A");
    const p2 = ProjectStore.scaffold("Proje B");
    p1.brain.tech_stack.push({ tech: "Laravel" });
    p2.brain.tech_stack.push({ tech: "React" });
    await store.save(p1);
    await store.save(p2);

    store.clearCache();
    const loaded1 = await store.get(p1.id);
    const loaded2 = await store.get(p2.id);
    expect(loaded1.brain.tech_stack[0].tech).toBe("Laravel");
    expect(loaded2.brain.tech_stack[0].tech).toBe("React");
  });
});
