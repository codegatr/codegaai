"use strict";

/**
 * GitEngine — Git deposu üzerinde işlem yapan düşük seviyeli motor.
 *
 * Tüm komutlar `child_process.execFile` ile güvenli şekilde çalıştırılır.
 * Git ikili dosyası bulunamazsa kullanışlı hata mesajı döner.
 */

const { execFile } = require("node:child_process");
const path = require("node:path");

const GIT_TIMEOUT = 15000; // 15 saniye

/** git komutunu çalıştırır ve stdout/stderr döner */
function run(args, cwd, timeoutMs = GIT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: timeoutMs, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && err.code !== 0 && !stdout) {
          return reject(new Error(stderr?.trim() || err.message));
        }
        resolve({ stdout: stdout || "", stderr: stderr || "", code: err?.code ?? 0 });
      }
    );
  });
}

/** Git deposu kökünü bulur */
async function findRepoRoot(startDir) {
  try {
    const { stdout } = await run(["rev-parse", "--show-toplevel"], startDir);
    return stdout.trim();
  } catch (_e) {
    return null;
  }
}

/** Depo durumunu döner (staged/unstaged/untracked) */
async function status(repoPath) {
  const { stdout } = await run(["status", "--porcelain", "-u"], repoPath);
  const files = [];
  for (const line of stdout.split("\n").filter(Boolean)) {
    const x = line[0]; // index (staged)
    const y = line[1]; // worktree (unstaged)
    const file = line.slice(3).trim();
    const renamed = file.includes(" -> ") ? file.split(" -> ") : null;
    files.push({
      staged: x !== " " && x !== "?",
      unstaged: y !== " " && y !== "?",
      untracked: x === "?" && y === "?",
      status: line.slice(0, 2),
      file: renamed ? renamed[1] : file,
      oldFile: renamed ? renamed[0] : null,
    });
  }
  return files;
}

/** Staged diff (git diff --cached) */
async function diffStaged(repoPath) {
  const { stdout } = await run(["diff", "--cached", "--stat", "-p", "--no-color"], repoPath);
  return stdout;
}

/** Unstaged diff (git diff) */
async function diffUnstaged(repoPath) {
  const { stdout } = await run(["diff", "--stat", "-p", "--no-color"], repoPath);
  return stdout;
}

/** Belirli dosyalar için diff */
async function diffFiles(repoPath, files = [], staged = false) {
  const args = ["diff", "--no-color", staged ? "--cached" : null, "--", ...files].filter(Boolean);
  const { stdout } = await run(args, repoPath);
  return stdout;
}

/** Commit geçmişi */
async function log(repoPath, { n = 20, oneline = false, since = null, until = null } = {}) {
  const args = ["log", `--max-count=${n}`, "--no-color"];
  if (oneline) args.push("--oneline");
  else args.push("--format=%H|%an|%ae|%ai|%s|%b");
  if (since) args.push(`--since=${since}`);
  if (until) args.push(`--until=${until}`);

  const { stdout } = await run(args, repoPath);
  if (oneline) return stdout.trim().split("\n").filter(Boolean).map((l) => {
    const [sha, ...rest] = l.split(" ");
    return { sha: sha.trim(), message: rest.join(" ").trim() };
  });

  return stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [sha, author, email, date, subject, ...bodyParts] = line.split("|");
    return { sha, author, email, date, subject, body: bodyParts.join("|").trim() };
  });
}

/** Mevcut branch adı */
async function currentBranch(repoPath) {
  try {
    const { stdout } = await run(["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
    return stdout.trim();
  } catch (_e) {
    return "unknown";
  }
}

/** Tüm branch listesi (local + remote) */
async function branches(repoPath) {
  const { stdout } = await run(["branch", "-a", "--no-color"], repoPath);
  return stdout.split("\n").filter(Boolean).map((l) => ({
    current: l.startsWith("*"),
    name: l.replace(/^\*?\s+/, "").trim(),
  }));
}

/** Tag listesi */
async function tags(repoPath) {
  const { stdout } = await run(["tag", "--sort=-version:refname"], repoPath);
  return stdout.split("\n").filter(Boolean);
}

/** İki ref arasındaki commit listesi (release notes için) */
async function commitsBetween(repoPath, from, to = "HEAD") {
  const range = from ? `${from}..${to}` : to;
  const { stdout } = await run(
    ["log", range, "--no-color", "--format=%H|%an|%ai|%s", "--no-merges"],
    repoPath
  );
  return stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [sha, author, date, ...rest] = line.split("|");
    return { sha: sha?.slice(0, 7), author, date, subject: rest.join("|").trim() };
  });
}

/** Merge conflict olan dosyaları ve içeriklerini döner */
async function conflictFiles(repoPath) {
  const files = await status(repoPath);
  const conflicts = files.filter((f) => f.status === "UU" || f.status === "AA" || f.status === "DD");
  const result = [];
  for (const cf of conflicts) {
    try {
      const { stdout } = await run(["show", `:1:${cf.file}`], repoPath).catch(() => ({ stdout: "" }));
      result.push({ file: cf.file, status: cf.status });
    } catch (_e) {
      result.push({ file: cf.file, status: cf.status });
    }
  }
  return result;
}

/** Staged diff içindeki istatistikleri özet olarak çıkarır */
async function diffSummary(repoPath) {
  try {
    const { stdout } = await run(["diff", "--cached", "--stat", "--no-color"], repoPath);
    const lastLine = stdout.trim().split("\n").pop() || "";
    return { raw: stdout.trim(), summary: lastLine };
  } catch (_e) {
    return { raw: "", summary: "" };
  }
}

/** git remote URL'si */
async function remoteUrl(repoPath, remote = "origin") {
  try {
    const { stdout } = await run(["remote", "get-url", remote], repoPath);
    return stdout.trim();
  } catch (_e) {
    return "";
  }
}

module.exports = {
  findRepoRoot,
  status,
  diffStaged,
  diffUnstaged,
  diffFiles,
  log,
  currentBranch,
  branches,
  tags,
  commitsBetween,
  conflictFiles,
  diffSummary,
  remoteUrl,
};
