"use strict";

/**
 * plugin-store.test.js
 *
 * PluginStore ve validateManifest fonksiyonlarını test eder.
 * Electron bağımlılığı yok — saf Node.js/fs ortamında çalışır.
 */

const path = require("node:path");
const os   = require("node:os");
const fsp  = require("node:fs/promises");

const { PluginStore, validateManifest } = require("../plugins/plugin-store");

// ── validateManifest ─────────────────────────────────────────────

describe("validateManifest()", () => {
  const baseDir = path.join(os.tmpdir(), "codega-plugin-validate");

  test("geçerli manifest kabul edilmeli", () => {
    const manifest = { id: "my-plugin", name: "My Plugin", version: "1.0.0", entry: "index.js" };
    expect(() => validateManifest(manifest, baseDir)).not.toThrow();
  });

  test("eksik 'id' alanı hata fırlatmalı", () => {
    const manifest = { name: "X", version: "1.0.0", entry: "index.js" };
    expect(() => validateManifest(manifest, baseDir)).toThrow();
  });

  test("eksik 'entry' alanı hata fırlatmalı", () => {
    const manifest = { id: "my-plugin", name: "X", version: "1.0.0" };
    expect(() => validateManifest(manifest, baseDir)).toThrow();
  });

  test("geçersiz id formatı (büyük harf) hata fırlatmalı", () => {
    const manifest = { id: "MyPlugin", name: "X", version: "1.0.0", entry: "index.js" };
    expect(() => validateManifest(manifest, baseDir)).toThrow();
  });

  test("geçersiz id formatı (boşluk) hata fırlatmalı", () => {
    const manifest = { id: "my plugin", name: "X", version: "1.0.0", entry: "index.js" };
    expect(() => validateManifest(manifest, baseDir)).toThrow();
  });

  test("geçersiz semver formatı hata fırlatmalı", () => {
    const manifest = { id: "my-plugin", name: "X", version: "v1.0", entry: "index.js" };
    expect(() => validateManifest(manifest, baseDir)).toThrow();
  });

  test("path traversal saldırısı hata fırlatmalı", () => {
    const manifest = { id: "my-plugin", name: "X", version: "1.0.0", entry: "../../evil.js" };
    expect(() => validateManifest(manifest, baseDir)).toThrow(/dışına/);
  });

  test("tire ve alt çizgi içeren id kabul edilmeli", () => {
    const manifest = { id: "my_cool-plugin", name: "X", version: "2.3.4", entry: "index.js" };
    expect(() => validateManifest(manifest, baseDir)).not.toThrow();
  });
});

// ── PluginStore ──────────────────────────────────────────────────

describe("PluginStore", () => {
  let baseDir;
  let store;

  beforeEach(async () => {
    baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "codega-plugin-store-"));
    store = new PluginStore(baseDir);
  });

  afterEach(async () => {
    await fsp.rm(baseDir, { recursive: true, force: true }).catch(() => {});
  });

  // Plugin dizini yardımcısı
  async function writePlugin(id, manifestOverrides = {}) {
    const pluginDir = path.join(baseDir, id);
    await fsp.mkdir(pluginDir, { recursive: true });
    const manifest = {
      id,
      name: `${id} Plugin`,
      version: "1.0.0",
      entry: "index.js",
      ...manifestOverrides,
    };
    await fsp.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest), "utf8");
    await fsp.writeFile(path.join(pluginDir, "index.js"), "module.exports = {};", "utf8");
    return manifest;
  }

  test("boş dizinde discover() boş liste döndürmeli", async () => {
    const results = await store.discover();
    expect(results).toEqual([]);
    expect(store.list()).toEqual([]);
  });

  test("geçerli plugin keşfedilmeli", async () => {
    await writePlugin("hello-plugin");
    await store.discover();
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("hello-plugin");
    expect(list[0].name).toBe("hello-plugin Plugin");
    expect(list[0].enabled).toBe(true);
  });

  test("birden fazla plugin keşfedilmeli", async () => {
    await writePlugin("plugin-a");
    await writePlugin("plugin-b");
    await writePlugin("plugin-c");
    await store.discover();
    expect(store.list()).toHaveLength(3);
  });

  test("geçersiz manifest'li plugin sessizce atlanmalı", async () => {
    await writePlugin("good-plugin");
    // Kötü manifest
    const badDir = path.join(baseDir, "bad-plugin");
    await fsp.mkdir(badDir);
    await fsp.writeFile(path.join(badDir, "plugin.json"), '{"id":"bad plugin"}', "utf8");
    await store.discover();
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].id).toBe("good-plugin");
  });

  test("klasör adı ile manifest id uyuşmazlığı atlanmalı", async () => {
    const dir = path.join(baseDir, "folder-name");
    await fsp.mkdir(dir);
    const manifest = { id: "different-id", name: "X", version: "1.0.0", entry: "index.js" };
    await fsp.writeFile(path.join(dir, "plugin.json"), JSON.stringify(manifest), "utf8");
    await store.discover();
    expect(store.list()).toHaveLength(0);
  });

  test("setEnabled() false yapıp tekrar discover() edince disabled kalmalı", async () => {
    await writePlugin("my-plugin");
    await store.discover();
    await store.setEnabled("my-plugin", false);

    // Yeni store örneği — state dosyasından okumalı
    const store2 = new PluginStore(baseDir);
    await store2.discover();
    expect(store2.list()[0].enabled).toBe(false);
  });

  test("get() keşfedilen plugin'i döndürmeli", async () => {
    await writePlugin("target-plugin");
    await store.discover();
    const record = store.get("target-plugin");
    expect(record).not.toBeNull();
    expect(record.manifest.id).toBe("target-plugin");
  });

  test("get() olmayan plugin için null döndürmeli", async () => {
    await store.discover();
    expect(store.get("nonexistent")).toBeNull();
  });

  test("uninstall() plugin dizinini silmeli", async () => {
    await writePlugin("removable");
    await store.discover();
    await store.uninstall("removable");
    expect(store.list()).toHaveLength(0);
    const exists = await fsp.access(path.join(baseDir, "removable")).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("installFromDir() yeni plugin'i kurmalı", async () => {
    // Kaynak dizin
    const srcDir = await fsp.mkdtemp(path.join(os.tmpdir(), "codega-plugin-src-"));
    try {
      const manifest = { id: "new-plugin", name: "New", version: "1.0.0", entry: "index.js" };
      await fsp.writeFile(path.join(srcDir, "plugin.json"), JSON.stringify(manifest), "utf8");
      await fsp.writeFile(path.join(srcDir, "index.js"), "module.exports = {};", "utf8");

      const summary = await store.installFromDir(srcDir);
      expect(summary.id).toBe("new-plugin");
      expect(summary.enabled).toBe(true);

      // Dosya gerçekten kopyalandı mı?
      const installed = await fsp.access(path.join(baseDir, "new-plugin", "plugin.json")).then(() => true).catch(() => false);
      expect(installed).toBe(true);
    } finally {
      await fsp.rm(srcDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
