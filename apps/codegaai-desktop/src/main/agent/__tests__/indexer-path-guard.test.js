"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assertWithinRoot, isWithinRoot, isSubPath, normalizeForCompare, PathSecurityError } = require("../indexer/path-guard");

let root;
beforeEach(() => { root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "codega-root-"))); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("path-guard: containment", () => {
  test("kök içi yol kabul, göreli yol köke sabitlenir", () => {
    fs.mkdirSync(path.join(root, "src"));
    const p = assertWithinRoot(root, "src");
    expect(isSubPath(root, p)).toBe(true);
  });

  test("path traversal (..) reddedilir", () => {
    expect(() => assertWithinRoot(root, "../../../etc/passwd")).toThrow(PathSecurityError);
    expect(isWithinRoot(root, path.join(root, "..", "disarisi"))).toBe(false);
  });

  test("NUL bayt reddedilir", () => {
    expect(() => assertWithinRoot(root, "a\0b")).toThrow(/NUL/);
  });

  test("boş girdi reddedilir", () => {
    expect(() => assertWithinRoot(root, "")).toThrow(PathSecurityError);
    expect(() => assertWithinRoot("", "x")).toThrow(PathSecurityError);
  });
});

describe("path-guard: symlink escape", () => {
  test("kök içinden dışarı gösteren symlink üzerinden erişim engellenir", () => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "codega-out-")));
    fs.writeFileSync(path.join(outside, "secret.txt"), "gizli");
    const link = path.join(root, "escape");
    let symlinked = true;
    try { fs.symlinkSync(outside, link, "junction"); }
    catch (_e) { try { fs.symlinkSync(outside, link); } catch (_e2) { symlinked = false; } }

    if (!symlinked) {
      // Windows'ta yetki yoksa testi atla (ortam kısıtı).
      fs.rmSync(outside, { recursive: true, force: true });
      return;
    }
    // "escape/secret.txt" gerçek yola çözülünce kök DIŞINDA → reddedilmeli.
    expect(isWithinRoot(root, path.join(link, "secret.txt"))).toBe(false);
    fs.rmSync(outside, { recursive: true, force: true });
  });
});

describe("path-guard: Windows path normalization", () => {
  test("ters/düz slash ve sürücü harfi tutarlı karşılaştırılır", () => {
    if (process.platform === "win32") {
      expect(normalizeForCompare("C:\\A\\B")).toBe(normalizeForCompare("c:/a/b"));
      expect(isSubPath("C:\\proj", "c:\\proj\\src\\x.js")).toBe(true);
      expect(isSubPath("C:\\proj", "C:\\projekt\\x")).toBe(false); // prefix tuzağı
    } else {
      // POSIX: prefix tuzağı yine yakalanmalı
      expect(isSubPath("/proj", "/proj/src/x")).toBe(true);
      expect(isSubPath("/proj", "/projekt/x")).toBe(false);
    }
  });
});
