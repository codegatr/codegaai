"use strict";

/**
 * git-ipc.js — Git Agent IPC handler kayıt modülü.
 *
 * Kayıtlı kanallar:
 *   git:status          (repoPath)                        → staged/unstaged/untracked dosyalar
 *   git:diff            (repoPath, staged?)               → diff çıktısı
 *   git:log             (repoPath, options?)              → commit geçmişi
 *   git:branches        (repoPath)                        → branch listesi
 *   git:tags            (repoPath)                        → tag listesi
 *   git:suggest-commit  (repoPath)                        → commit mesajı önerisi
 *   git:suggest-branch  (description, type?)              → branch adı önerisi
 *   git:release-notes   (repoPath, fromTag?, version?)    → release notes (markdown)
 *   git:changelog       (repoPath, maxTags?)              → CHANGELOG.md içeriği
 *   git:explain-conflict(conflictBlock)                   → çakışma açıklaması
 *   git:find-root       (startDir)                        → depo kökünü bul
 */

const { ipcMain } = require("electron");
const gitEngine   = require("./git-engine");
const gitAnalyzer = require("./git-analyzer");

/**
 * Güvenlik yardımcısı: repoPath'in gerçek bir git deposu kökü olduğunu doğrular.
 * Saldırgan bir renderer'ın keyfi dizin geçirmesini engeller.
 */
async function resolveRepo(repoPath) {
  if (!repoPath || typeof repoPath !== "string") throw new Error("Geçersiz depo yolu");
  const root = await gitEngine.findRepoRoot(repoPath);
  if (!root) throw new Error(`Git deposu bulunamadı: ${repoPath}`);
  return root;
}

function registerGitIpc() {
  ipcMain.handle("git:find-root", async (_e, startDir) => {
    try {
      const root = await gitEngine.findRepoRoot(startDir);
      return { ok: !!root, root };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:status", async (_e, repoPath) => {
    try {
      const root = await resolveRepo(repoPath);
      const files = await gitEngine.status(root);
      const branch = await gitEngine.currentBranch(root);
      return { ok: true, files, branch, root };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:diff", async (_e, repoPath, staged = true) => {
    try {
      const root = await resolveRepo(repoPath);
      const diff = staged
        ? await gitEngine.diffStaged(root)
        : await gitEngine.diffUnstaged(root);
      return { ok: true, diff, staged };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:log", async (_e, repoPath, opts = {}) => {
    try {
      const root = await resolveRepo(repoPath);
      const commits = await gitEngine.log(root, opts);
      return { ok: true, commits };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:branches", async (_e, repoPath) => {
    try {
      const root = await resolveRepo(repoPath);
      const list = await gitEngine.branches(root);
      const current = await gitEngine.currentBranch(root);
      return { ok: true, branches: list, current };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:tags", async (_e, repoPath) => {
    try {
      const root = await resolveRepo(repoPath);
      const list = await gitEngine.tags(root);
      return { ok: true, tags: list };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:suggest-commit", async (_e, repoPath) => {
    try {
      const root = await resolveRepo(repoPath);
      const result = await gitAnalyzer.suggestCommitMessage(root);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:suggest-branch", (_e, description, type = "feat") => {
    try {
      const result = gitAnalyzer.suggestBranchName(description, type);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

    ipcMain.handle("git:release-notes", async (_e, repoPath, fromTag = "", version = "") => {
    try {
      const root = await resolveRepo(repoPath);
      const result = await gitAnalyzer.generateReleaseNotes(root, fromTag, "HEAD", version);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:changelog", async (_e, repoPath, maxTags = 10) => {
    try {
      const root = await resolveRepo(repoPath);
      const changelog = await gitAnalyzer.generateChangelog(root, maxTags);
      return { ok: true, changelog };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:explain-conflict", (_e, conflictBlock) => {
    try {
      const result = gitAnalyzer.explainConflict(conflictBlock);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerGitIpc };
