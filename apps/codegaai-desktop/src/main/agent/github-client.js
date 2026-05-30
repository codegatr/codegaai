"use strict";
/**
 * agent/github-client.js
 * -----------------------
 * Ajanın GitHub yetisi — "aynı Claude gibi" repo okuma/arama, workflow tetikleme
 * ve öğrenilenleri AYRI bir bilgi dosyasına yazma.
 *
 * GÜVENLİK:
 * - Token kaynak koda GÖMÜLMEZ. Yalnızca ayarlardan (yerel userData) okunur.
 * - Yazma işlemleri sadece bilgi dosyasına eklemedir (append). Üretim koduna
 *   otonom yazma yapılmaz.
 */

const { getSettings } = require("./settings-store");

function token() {
  const s = getSettings();
  return String(s.githubToken || process.env.CODEGA_GH_TOKEN || "").trim();
}

function hasToken() {
  return token().length > 0;
}

async function gh(apiPath, { method = "GET", body = null, timeoutMs = 15000 } = {}) {
  const t = token();
  if (!t) throw new Error("GitHub token yok (Ayarlar'dan gir).");
  const url = apiPath.startsWith("http") ? apiPath : `https://api.github.com${apiPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        "User-Agent": "CODEGA-AI-Agent",
        Accept: "application/vnd.github+json",
        Authorization: `token ${t}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_e) { data = text; }
    if (!res.ok) {
      const msg = (data && data.message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function splitRepo(ownerRepo) {
  const m = String(ownerRepo || "").trim().match(/^([^/\s]+)\/([^/\s]+)/);
  if (!m) throw new Error("Repo formatı 'owner/repo' olmalı.");
  return { owner: m[1], repo: m[2] };
}

/** Token + kimlik doğrulama testi. */
async function testConnection() {
  const me = await gh("/user");
  return { login: me.login, name: me.name || me.login };
}

/** Dosya içeriğini oku (base64 çöz). */
async function readFile(owner, repo, filePath, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await gh(`/repos/${owner}/${repo}/contents/${filePath}${q}`);
  if (Array.isArray(data)) {
    return data.map((d) => `${d.type === "dir" ? "📁" : "📄"} ${d.path}`).join("\n");
  }
  if (data && data.content) {
    return Buffer.from(data.content, "base64").toString("utf8");
  }
  return "";
}

/** Dizin listele. */
async function listDir(owner, repo, dirPath = "", ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await gh(`/repos/${owner}/${repo}/contents/${dirPath}${q}`);
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((d) => `${d.type === "dir" ? "📁" : "📄"} ${d.path}`).join("\n");
}

/** Kod araması. */
async function searchCode(query) {
  const data = await gh(`/search/code?q=${encodeURIComponent(query)}&per_page=8`);
  const items = (data.items || []).map((i) => `• ${i.repository.full_name} → ${i.path}`);
  return items.length ? items.join("\n") : "Sonuç yok.";
}

/** Workflow tetikle (workflow_dispatch). */
async function dispatchWorkflow(owner, repo, workflowFile, ref = "main", inputs = {}) {
  await gh(`/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    body: { ref, inputs },
  });
  return `Workflow tetiklendi: ${owner}/${repo} → ${workflowFile} (${ref})`;
}

/**
 * Bilgi dosyasına satır(lar) ekle (append). Yoksa oluşturur.
 * Üretim kodu DEĞİL — yalnızca öğrenilen notların JSONL kaydı.
 */
async function appendToFile(owner, repo, filePath, branch, linesToAdd, message) {
  let existing = "";
  let sha = null;
  try {
    const cur = await gh(
      `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`
    );
    if (cur && cur.content) {
      existing = Buffer.from(cur.content, "base64").toString("utf8");
      sha = cur.sha;
    }
  } catch (_e) {
    // dosya yok → yeni oluşturulacak
  }
  const newContent =
    (existing && !existing.endsWith("\n") ? existing + "\n" : existing) +
    linesToAdd.join("\n") +
    "\n";
  await gh(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: "PUT",
    body: {
      message: message || "CODEGA AI: bilgi güncellemesi",
      content: Buffer.from(newContent, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    },
  });
  return linesToAdd.length;
}

/** Bilgi dosyasını oku (JSONL → satır metinleri). */
async function readKnowledgeFile(owner, repo, filePath, branch) {
  try {
    const content = await readFile(owner, repo, filePath, branch);
    return String(content || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (_e) {
    return [];
  }
}

/** Repo meta (default_branch vb.). */
async function getRepoMeta(owner, repo) {
  return gh(`/repos/${owner}/${repo}`);
}

/** Bir dalın HEAD commit SHA'sı. */
async function getBranchSha(owner, repo, branch) {
  const data = await gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  return data && data.object ? data.object.sha : null;
}

/** Yeni dal oluştur (mevcut bir SHA'dan). main'e DOKUNMAZ. */
async function createBranch(owner, repo, newBranch, fromSha) {
  return gh(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: { ref: `refs/heads/${newBranch}`, sha: fromSha },
  });
}

/** Belirli bir dalda yeni dosya oluştur (contents API). */
async function createFileOnBranch(owner, repo, filePath, branch, content, message) {
  return gh(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: "PUT",
    body: {
      message: message || "CODEGA AI öneri dosyası",
      content: Buffer.from(String(content), "utf8").toString("base64"),
      branch,
    },
  });
}

/** Pull Request aç (otomatik birleştirmez — insan onayı bekler). */
async function openPullRequest(owner, repo, head, base, title, body) {
  return gh(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: { title, head, base, body, maintainer_can_modify: true },
  });
}

module.exports = {
  hasToken,
  testConnection,
  readFile,
  listDir,
  searchCode,
  dispatchWorkflow,
  appendToFile,
  readKnowledgeFile,
  splitRepo,
  getRepoMeta,
  getBranchSha,
  createBranch,
  createFileOnBranch,
  openPullRequest,
  splitRepo,
};
