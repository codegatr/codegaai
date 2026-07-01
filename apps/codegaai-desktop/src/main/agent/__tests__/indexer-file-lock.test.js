"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { acquire, release, evaluateStale, isProcessAlive, releaseLockPath } = require("../indexer/file-lock");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-lock-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const lockPath = () => path.join(dir, "index.lock");

describe("file-lock: temel al/bırak", () => {
  test("boşken alınır, sahibi olmayan bırakamaz, sahibi bırakır", () => {
    const a = acquire({ lockPath: lockPath(), workspaceRoot: dir, ttlMs: 60000, operationId: "op1" });
    expect(a.ok).toBe(true);
    expect(a.lock.meta.pid).toBe(process.pid);
    // ikinci al → held
    const b = acquire({ lockPath: lockPath(), workspaceRoot: dir, ttlMs: 60000 });
    expect(b.ok).toBe(false);
    expect(b.reason).toBe("held");
    // yabancı owner ile release → false
    expect(release({ path: lockPath(), owner: "baska-owner" })).toBe(false);
    // gerçek sahibi → true
    expect(release(a.lock)).toBe(true);
    expect(fs.existsSync(lockPath())).toBe(false);
  });
});

describe("file-lock: stale/crash recovery", () => {
  test("crash sonrası (ölü PID + TTL aşımı) kilit devralınır", () => {
    // Elle "çökmüş" kilit yaz: ölü PID + eski startedAt.
    fs.writeFileSync(lockPath(), JSON.stringify({
      pid: 999999999, hostname: os.hostname(), owner: "dead", bootId: "x",
      startedAt: Date.now() - 10 * 60000, ttlMs: 1000, workspaceRoot: dir,
    }), "utf8");
    const a = acquire({ lockPath: lockPath(), workspaceRoot: dir, ttlMs: 60000 });
    expect(a.ok).toBe(true);
    expect(a.stealReason).toMatch(/pid_dead|corrupt/);
  });

  test("stale lock recovery: TTL içindeyse devralınmaz (canlı PID)", () => {
    fs.writeFileSync(lockPath(), JSON.stringify({
      pid: process.pid, hostname: os.hostname(), owner: "live",
      startedAt: Date.now(), ttlMs: 60000, workspaceRoot: dir,
    }), "utf8");
    const a = acquire({ lockPath: lockPath(), workspaceRoot: dir, ttlMs: 60000 });
    expect(a.ok).toBe(false);
    expect(a.reason).toBe("held");
  });

  test("PID reuse guard: canlı PID ama sert TTL (2x) aşımı → bayat", () => {
    const v = evaluateStale({
      pid: process.pid, hostname: os.hostname(),
      startedAt: Date.now() - 5000, ttlMs: 1000, // yaş 5x ttl
    });
    expect(v.stale).toBe(true);
    expect(v.reason).toMatch(/hard_ttl/);
  });

  test("corrupt lock meta → bayat sayılır", () => {
    fs.writeFileSync(lockPath(), "{ bozuk json", "utf8");
    const a = acquire({ lockPath: lockPath(), workspaceRoot: dir, ttlMs: 60000 });
    expect(a.ok).toBe(true); // corrupt → steal
  });
});

describe("file-lock: .release.lock defer", () => {
  test("release lock varken indexer çalışmaz, defer state yazılır", () => {
    fs.writeFileSync(releaseLockPath(dir), "release in progress", "utf8");
    const a = acquire({ lockPath: lockPath(), workspaceRoot: dir, ttlMs: 60000 });
    expect(a.ok).toBe(false);
    expect(a.deferred).toBe(true);
    expect(a.reason).toBe("release_in_progress");
    expect(fs.existsSync(`${lockPath()}.deferred`)).toBe(true);
  });
});

describe("file-lock: isProcessAlive", () => {
  test("mevcut process canlı, saçma PID değil", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(2147483646)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
  });
});
