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
      const files = await gitEngine.status(repoPath);
      const branch = await gitEngine.currentBranch(repoPath);
      return { ok: true, files, branch };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:diff", async (_e, repoPath, staged = true) => {
    try {
      const diff = staged
        ? await gitEngine.diffStaged(repoPath)
        : await gitEngine.diffUnstaged(repoPath);
      return { ok: true, diff, staged };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:log", async (_e, repoPath, opts = {}) => {
    try {
      const commits = await gitEngine.log(repoPath, opts);
      return { ok: true, commits };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:branches", async (_e, repoPath) => {
    try {
      const list = await gitEngine.branches(repoPath);
      const current = await gitEngine.currentBranch(repoPath);
      return { ok: true, branches: list, current };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:tags", async (_e, repoPath) => {
    try {
      const list = await gitEngine.tags(repoPath);
      return { ok: true, tags: list };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:suggest-commit", async (_e, repoPath) => {
    try {
      const result = await gitAnalyzer.suggestCommitMessage(repoPath);
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
      const result = await gitAnalyzer.generateReleaseNotes(repoPath, fromTag, "HEAD", version);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("git:changelog", async (_e, repoPath, maxTags = 10) => {
    try {
      const changelog = await gitAnalyzer.generateChangelog(repoPath, maxTags);
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
