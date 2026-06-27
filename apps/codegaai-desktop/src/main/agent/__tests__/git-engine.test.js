"use strict";

/**
 * git-engine.test.js
 *
 * GitEngine fonksiyonlarını gerçek git binary ile test eder.
 * Her test kendi geçici git reposunu oluşturur ve temizler.
 */

const path = require("node:path");
const os   = require("node:os");
const fsp  = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execAsync = promisify(execFile);

const git = require("../git/git-engine");

// ── Yardımcı: geçici git repo ────────────────────────────────────

async function createTempRepo() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "codega-git-test-"));
  await execAsync("git", ["init"], { cwd: dir });
  await execAsync("git", ["config", "user.email", "test@codega.ai"], { cwd: dir });
  await execAsync("git", ["config", "user.name",  "CODEGA Test"],    { cwd: dir });
  return dir;
}

async function commit(dir, filename, content, message) {
  await fsp.writeFile(path.join(dir, filename), content, "utf8");
  await execAsync("git", ["add", "."], { cwd: dir });
  await execAsync("git", ["commit", "-m", message], { cwd: dir });
}

// ── findRepoRoot() ───────────────────────────────────────────────

describe("findRepoRoot()", () => {
  let tmpDir;

  beforeAll(async () => { tmpDir = await createTempRepo(); });
  afterAll(async  () => { await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  test("geçerli git reposunda root klasörünü bulmalı", async () => {
    const root = await git.findRepoRoot(tmpDir);
    expect(root).toBeTruthy();
    expect(typeof root).toBe("string");
  });

  test("git reposu olmayan dizinde null döndürmeli", async () => {
    const root = await git.findRepoRoot(os.tmpdir());
    // os.tmpdir() git reposu değil (veya üst dizinde repo varsa path döner, ikisi de kabul)
    // Sadece hata fırlatmamalı
    expect(root === null || typeof root === "string").toBe(true);
  });
});

// ── status() ─────────────────────────────────────────────────────

describe("status()", () => {
  let tmpDir;

  beforeEach(async () => { tmpDir = await createTempRepo(); });
  afterEach(async  () => { await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  test("ilk commit sonrası status çalışmalı", async () => {
    await commit(tmpDir, "README.md", "# Test", "init");
    const s = await git.status(tmpDir);
    expect(s).toBeDefined();
    expect(typeof s).toBe("object");
  });

  test("untracked dosya status nesnesine yansımalı", async () => {
    await commit(tmpDir, "base.txt", "x", "init");
    await fsp.writeFile(path.join(tmpDir, "new.js"), 'console.log(1)', "utf8");
    const s = await git.status(tmpDir);
    const raw = JSON.stringify(s);
    expect(raw).toMatch(/new\.js|untracked/i);
  });
});

// ── log() ────────────────────────────────────────────────────────

describe("log()", () => {
  let tmpDir;

  beforeAll(async () => {
    tmpDir = await createTempRepo();
    await commit(tmpDir, "a.txt", "aaa", "feat: ilk commit");
    await commit(tmpDir, "b.txt", "bbb", "feat: ikinci commit");
    await commit(tmpDir, "c.txt", "ccc", "fix: üçüncü commit");
  });
  afterAll(async () => { await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  test("commit listesi döndürmeli", async () => {
    const entries = await git.log(tmpDir, { n: 10 });
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  test("her commit hash alanına sahip olmalı", async () => {
    const entries = await git.log(tmpDir, { n: 5 });
    for (const e of entries) {
      expect(e).toHaveProperty("sha");
      expect(e.sha).toMatch(/^[a-f0-9]+/);
    }
  });

  test("n parametresi commit sayısını sınırlamalı", async () => {
    const entries = await git.log(tmpDir, { n: 2 });
    expect(entries.length).toBeLessThanOrEqual(2);
  });
});

// ── branches() + currentBranch() ────────────────────────────────

describe("branches() / currentBranch()", () => {
  let tmpDir;

  beforeAll(async () => {
    tmpDir = await createTempRepo();
    await commit(tmpDir, "init.txt", "x", "init");
  });
  afterAll(async () => { await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  test("en az bir branch dönmeli", async () => {
    const list = await git.branches(tmpDir);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  test("currentBranch() string döndürmeli", async () => {
    const branch = await git.currentBranch(tmpDir);
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
  });
});

// ── diffStaged() ─────────────────────────────────────────────────

describe("diffStaged()", () => {
  let tmpDir;

  beforeEach(async () => { tmpDir = await createTempRepo(); });
  afterEach(async  () => { await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });

  test("staged değişiklik olmadan boş string döndürmeli", async () => {
    await commit(tmpDir, "base.txt", "original", "init");
    const diff = await git.diffStaged(tmpDir);
    expect(typeof diff).toBe("string");
    expect(diff.trim()).toBe("");
  });

  test("staged dosya diff'te görünmeli", async () => {
    await commit(tmpDir, "base.txt", "original", "init");
    await fsp.writeFile(path.join(tmpDir, "base.txt"), "changed content", "utf8");
    await execAsync("git", ["add", "base.txt"], { cwd: tmpDir });
    const diff = await git.diffStaged(tmpDir);
    expect(diff).toMatch(/changed content|base\.txt/);
  });
});
