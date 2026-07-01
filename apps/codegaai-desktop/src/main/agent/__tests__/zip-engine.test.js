"use strict";

const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

const zip = require("../zip/zip-engine");

async function exists(filePath) {
  return fsp.access(filePath).then(() => true).catch(() => false);
}

async function writeProject(root, manifest = {}) {
  await fsp.mkdir(root, { recursive: true });
  await fsp.writeFile(path.join(root, "manifest.json"), JSON.stringify({
    projectSignature: zip.DEFAULT_PROJECT_SIGNATURE,
    version: "1.0.0",
    ...manifest,
  }, null, 2), "utf8");
  await fsp.mkdir(path.join(root, "src"), { recursive: true });
  await fsp.writeFile(path.join(root, "src", "index.js"), "console.log('ok');\n", "utf8");
}

describe("ZipEngine secure project import/export", () => {
  let dir;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "codega-zip-engine-"));
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  test("project archive export uses level 9 compression", () => {
    expect(zip.PROJECT_ARCHIVE_ZLIB_LEVEL).toBe(9);
  });

  test("project archive cannot be written inside the source directory", async () => {
    const source = path.join(dir, "source");
    await writeProject(source);

    await expect(zip.createProjectArchive(source, path.join(source, "project.zip")))
      .rejects.toThrow(/kaynak klasör/i);
  });

  test("valid manifest import succeeds and cleans temp folder", async () => {
    const source = path.join(dir, "source");
    const archive = path.join(dir, "project.zip");
    const workspace = path.join(dir, "workspace");
    const tempDir = path.join(dir, "_temp_import");
    await writeProject(source);

    await zip.createProjectArchive(source, archive);
    const result = await zip.importProjectArchive(archive, workspace, { tempDir });

    expect(result.files).toBeGreaterThan(0);
    expect(result.manifest.projectSignature).toBe(zip.DEFAULT_PROJECT_SIGNATURE);
    expect(await exists(path.join(workspace, "src", "index.js"))).toBe(true);
    expect(await exists(tempDir)).toBe(false);
  }, 15000);

  test("missing manifest aborts import and leaves workspace untouched", async () => {
    const source = path.join(dir, "source");
    const archive = path.join(dir, "no-manifest.zip");
    const workspace = path.join(dir, "workspace");
    const tempDir = path.join(dir, "_temp_import");
    await fsp.mkdir(source, { recursive: true });
    await fsp.writeFile(path.join(source, "README.md"), "hello", "utf8");
    await fsp.mkdir(workspace, { recursive: true });
    await fsp.writeFile(path.join(workspace, "keep.txt"), "keep", "utf8");

    await zip.create(archive, source);
    await expect(zip.importProjectArchive(archive, workspace, { tempDir })).rejects.toThrow(/manifest/i);

    expect(await fsp.readFile(path.join(workspace, "keep.txt"), "utf8")).toBe("keep");
    expect(await exists(path.join(workspace, "README.md"))).toBe(false);
    expect(await exists(tempDir)).toBe(false);
  }, 15000);

  test("signature mismatch aborts import and leaves workspace untouched", async () => {
    const source = path.join(dir, "source");
    const archive = path.join(dir, "bad-signature.zip");
    const workspace = path.join(dir, "workspace");
    await writeProject(source, { projectSignature: "wrong.signature" });
    await fsp.mkdir(workspace, { recursive: true });
    await fsp.writeFile(path.join(workspace, "keep.txt"), "keep", "utf8");

    await zip.createProjectArchive(source, archive);
    await expect(zip.importProjectArchive(archive, workspace)).rejects.toThrow(/imza/i);

    expect(await fsp.readFile(path.join(workspace, "keep.txt"), "utf8")).toBe("keep");
    expect(await exists(path.join(workspace, "src", "index.js"))).toBe(false);
  }, 15000);

  test("missing manifest version aborts import and leaves workspace untouched", async () => {
    const source = path.join(dir, "source");
    const archive = path.join(dir, "missing-version.zip");
    const workspace = path.join(dir, "workspace");
    await writeProject(source, { version: undefined });
    await fsp.writeFile(path.join(source, "manifest.json"), JSON.stringify({
      projectSignature: zip.DEFAULT_PROJECT_SIGNATURE,
    }, null, 2), "utf8");
    await fsp.mkdir(workspace, { recursive: true });
    await fsp.writeFile(path.join(workspace, "keep.txt"), "keep", "utf8");

    await zip.createProjectArchive(source, archive);
    await expect(zip.importProjectArchive(archive, workspace)).rejects.toThrow(/sürüm/i);

    expect(await fsp.readFile(path.join(workspace, "keep.txt"), "utf8")).toBe("keep");
    expect(await exists(path.join(workspace, "src", "index.js"))).toBe(false);
  }, 15000);

  test("unsafe zip entry names are rejected", () => {
    expect(() => zip._assertSafeEntryName("../evil.txt")).toThrow(/path traversal/i);
    expect(() => zip._assertSafeEntryName("/tmp/evil.txt")).toThrow(/absolute/i);
    expect(() => zip._assertSafeEntryName("C:/tmp/evil.txt")).toThrow(/absolute/i);
  });

  test("patch rejects unsafe entry names and cannot write outside temp extraction", async () => {
    const source = path.join(dir, "patch-source");
    const archive = path.join(dir, "patch-source.zip");
    const patched = path.join(dir, "patch-out.zip");
    const outside = path.join(dir, "outside.txt");
    await writeProject(source);
    await zip.createProjectArchive(source, archive);

    await expect(zip.patch(archive, patched, [
      { action: "add", name: "../outside.txt", content: "owned" },
    ])).rejects.toThrow(/path traversal/i);

    expect(await exists(outside)).toBe(false);
    expect(await exists(patched)).toBe(false);
  }, 15000);

  test("commit rollback: overwritten file restored on mid-commit failure, no temp leftover", async () => {
    const source = path.join(dir, "src-commit");
    const workspace = path.join(dir, "ws-commit");
    await fsp.mkdir(source, { recursive: true });
    await fsp.writeFile(path.join(source, "a.txt"), "new", "utf8");
    await fsp.writeFile(path.join(source, "b.txt"), "new-b", "utf8");
    // workspace: a.txt mevcut (dosya), b.txt bir KLASÖR → b.txt'i işlerken
    // copyFile(dir → backup) hata fırlatır ve commit yarıda kalır.
    await fsp.mkdir(workspace, { recursive: true });
    await fsp.writeFile(path.join(workspace, "a.txt"), "orig", "utf8");
    await fsp.mkdir(path.join(workspace, "b.txt"), { recursive: true });

    await expect(zip.commitImportedProject(source, workspace)).rejects.toThrow();

    // a.txt overwrite edilmişse rollback ile "orig"e dönmeli; hiç dokunulmadıysa zaten "orig".
    expect(await fsp.readFile(path.join(workspace, "a.txt"), "utf8")).toBe("orig");
    // Yarıda kalan staged temp dosyası workspace'te kalmamalı.
    const leftovers = (await fsp.readdir(workspace)).filter((n) => n.includes(".codega_tmp_"));
    expect(leftovers).toEqual([]);
  }, 15000);
});
