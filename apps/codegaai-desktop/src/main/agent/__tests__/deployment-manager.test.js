"use strict";

/**
 * deployment-manager.test.js — V7 Deployment omurgası sözleşmesi.
 * Ağ yok: sahte DirectAdmin istemcisi enjekte edilir (clientFactory).
 */

const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { DeploymentManager, scanModuleMap } = require("../deploy/deployment-manager");
const { assertSafeRemotePath } = require("../deploy/directadmin-client");
const zipEngine = require("../zip/zip-engine");

const SETTINGS = {
  directadminHost: "panel.example.com",
  directadminPort: 2222,
  directadminUsername: "codega",
  directadminLoginKey: "test-login-key",
  deployRemoteDir: "/domains/example.com/public_html",
  toolPermissions: { deployment: "ask" },
};

function fakeClient(calls, opts = {}) {
  return {
    async testConnection() { calls.push(["test"]); return { ok: true, domains: ["example.com"] }; },
    async uploadZip({ remoteDir, localZipPath, onProgress }) {
      calls.push(["upload", remoteDir, path.basename(localZipPath)]);
      if (opts.failUpload) throw new Error("yükleme koptu");
      onProgress && onProgress(512, 1024);
      onProgress && onProgress(1024, 1024);
      return { ok: true };
    },
    async extract({ remoteDir, zipName }) { calls.push(["extract", remoteDir, zipName]); return { ok: true }; },
  };
}

async function makeZip(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-deploy-"));
  const src = path.join(dir, "src");
  fs.mkdirSync(path.join(src, "muayene"), { recursive: true });
  fs.mkdirSync(path.join(src, "finans"), { recursive: true });
  fs.writeFileSync(path.join(src, "index.php"), "<?php echo 'ok';");
  fs.writeFileSync(path.join(src, "muayene", "kayit.php"), "<?php // kayıt");
  fs.writeFileSync(path.join(src, "muayene", "rapor.php"), "<?php // rapor");
  fs.writeFileSync(path.join(src, "finans", "cari.php"), "<?php // cari");
  const zipPath = path.join(dir, name);
  await zipEngine.create(zipPath, src);
  return zipPath;
}

describe("scanModuleMap — dinamik, hardcoded sayaç yok (İster 3)", () => {
  test("modül haritası ZIP girdilerinden türetilir", () => {
    const map = scanModuleMap([
      { name: "muayene/kayit.php" }, { name: "muayene/rapor.php" },
      { name: "finans/cari.php" }, { name: "index.php" }, { name: "bos-dizin/" },
    ]);
    expect(map).toEqual([
      { module: "muayene", files: 2 },
      { module: "finans", files: 1 },
      { module: "(kök)", files: 1 },
    ]);
  });
});

describe("DeploymentManager — aşamalı deploy + progress stream (İster 1)", () => {
  test("happy path: describing→uploading→extracting→done, olaylar sıralı akar", async () => {
    const calls = [];
    const events = [];
    const mgr = new DeploymentManager({
      getSettings: () => SETTINGS,
      clientFactory: () => fakeClient(calls),
      onEvent: (e) => events.push(e.phase + ":" + e.progress),
    });
    const zipPath = await makeZip("muayene-sistemi.zip");
    const res = await mgr.deployZip({ localZipPath: zipPath, remoteDir: "/domains/example.com/public_html" });

    expect(res.ok).toBe(true);
    expect(res.moduleMap.length).toBeGreaterThanOrEqual(2); // dinamik harita
    expect(calls.map((c) => c[0])).toEqual(["upload", "extract"]);
    expect(events[0]).toMatch(/^describing:/);
    expect(events[events.length - 1]).toBe("done:100");
    expect(events.some((e) => /^uploading:/.test(e))).toBe(true);
    expect(events.some((e) => /^extracting:/.test(e))).toBe(true);
  });

  test("yükleme hatası → failed olayı + hata fırlar; tek-uçuş kilidi serbest kalır", async () => {
    const events = [];
    const mgr = new DeploymentManager({
      getSettings: () => SETTINGS,
      clientFactory: () => fakeClient([], { failUpload: true }),
      onEvent: (e) => events.push(e.phase),
    });
    const zipPath = await makeZip("codega-finans-mini.zip");
    await expect(mgr.deployZip({ localZipPath: zipPath })).rejects.toThrow(/yükleme koptu/);
    expect(events[events.length - 1]).toBe("failed");
    // kilit bırakıldı → ikinci deneme "devam eden deploy" hatası VERMEZ
    await expect(mgr.deployZip({ localZipPath: zipPath })).rejects.toThrow(/yükleme koptu/);
  });

  test("izin 'deny' ise preflight reddeder (güvenlik sözleşmesi)", async () => {
    const mgr = new DeploymentManager({
      getSettings: () => ({ ...SETTINGS, toolPermissions: { deployment: "deny" } }),
      clientFactory: () => fakeClient([]),
    });
    await expect(mgr.deployZip({ localZipPath: "x.zip" })).rejects.toThrow(/izni kapalı/);
  });

  test("eksik DirectAdmin ayarı erken ve net hata verir", () => {
    const mgr = new DeploymentManager({ getSettings: () => ({ toolPermissions: {} }) });
    expect(mgr.preflight().ok).toBe(false);
    expect(mgr.preflight().error).toMatch(/bağlantı bilgileri eksik/);
  });
});

describe("assertSafeRemotePath — path traversal koruması", () => {
  test("'..' içeren ve göreli yollar reddedilir", () => {
    expect(() => assertSafeRemotePath("/domains/../../etc")).toThrow(/'\.\.'/);
    expect(() => assertSafeRemotePath("domains/site")).toThrow(/başlamalı/);
    expect(assertSafeRemotePath("/domains/site.com/public_html/")).toBe("/domains/site.com/public_html");
  });
});
