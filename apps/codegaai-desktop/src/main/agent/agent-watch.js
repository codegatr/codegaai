"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sourceTrust = require("./source-trust");

const DEFAULT_SOURCES = Object.freeze([
  { id: "openai-codex", label: "OpenAI Codex", repo: "openai/codex", tier: "official" },
  { id: "claude-code", label: "Anthropic Claude Code", repo: "anthropics/claude-code", tier: "official" },
  { id: "claude-code-research", label: "Dive into Claude Code", repo: "VILA-Lab/Dive-into-Claude-Code", tier: "research" },
  { id: "claude-code-leak-watch", label: "Claude Code Leak Watch", repo: "tanbiralam/claude-code", tier: "blocked" },
  { id: "gemini-cli", label: "Google Gemini CLI", repo: "google-gemini/gemini-cli", tier: "official" },
  { id: "qwen-code", label: "Qwen Code", repo: "QwenLM/qwen-code", tier: "official" },
  { id: "qwen-agent", label: "Qwen Agent", repo: "QwenLM/Qwen-Agent", tier: "official" },
  { id: "qwen-models", label: "Qwen Models", repo: "QwenLM/Qwen3.6", tier: "official" },
  { id: "gemma-models", label: "Google Gemma", repo: "google-deepmind/gemma", tier: "official" },
  { id: "llama-models", label: "Meta Llama", repo: "meta-llama/llama-models", tier: "official" },
  { id: "mistral-models", label: "Mistral", repo: "mistralai/mistral-inference", tier: "official" },
  { id: "openhands", label: "OpenHands", repo: "All-Hands-AI/OpenHands", tier: "community" },
  { id: "aider", label: "Aider", repo: "Aider-AI/aider", tier: "community" },
  { id: "cline", label: "Cline", repo: "cline/cline", tier: "community" },
  { id: "continue", label: "Continue", repo: "continuedev/continue", tier: "community" },
]);

const REUSE_LICENSES = sourceTrust.REUSE_LICENSES;

function storePath() {
  return process.env.CODEGA_AGENT_WATCH_PATH || path.join(os.homedir(), ".codega-ai", "agent-watch.json");
}

function emptyState() {
  return { lastScanAt: null, configuredSourceCount: DEFAULT_SOURCES.length, sources: {}, findings: [], errors: [] };
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return {
      ...emptyState(),
      ...parsed,
      sources: parsed && typeof parsed.sources === "object" ? parsed.sources : {},
      findings: Array.isArray(parsed && parsed.findings) ? parsed.findings : [],
      errors: Array.isArray(parsed && parsed.errors) ? parsed.errors : [],
    };
  } catch (_e) {
    return emptyState();
  }
}

function save(state) {
  const target = storePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
  try {
    fs.renameSync(temp, target);
  } catch (_e) {
    fs.copyFileSync(temp, target);
    fs.rmSync(temp, { force: true });
  }
}

function splitRepo(repo) {
  const parts = String(repo || "").split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Gecersiz GitHub deposu: ${repo}`);
  return { owner: parts[0], name: parts[1] };
}

function licensePolicy(spdxId) {
  return sourceTrust.licensePolicy(spdxId);
}

function sanitizeText(value, max = 240) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const CAPABILITY_RULES = Object.freeze([
  ["tooling", /\b(tool|function call|mcp|plugin|extension)\b/i],
  ["memory", /\b(memory|context|session|checkpoint|restore)\b/i],
  ["orchestration", /\b(agent|subagent|multi-agent|orchestrat|delegate)\b/i],
  ["safety", /\b(permission|sandbox|security|approval|policy|secret)\b/i],
  ["automation", /\b(hook|automation|workflow|background|schedule)\b/i],
  ["quality", /\b(test|verify|eval|benchmark|review|lint)\b/i],
  ["models", /\b(model|qwen|gemini|claude|gpt|llama|ollama)\b/i],
  ["ux", /\b(ui|ux|interface|stream|progress|terminal|desktop)\b/i],
]);

function classifyCapabilities(...values) {
  const text = values.map((value) => sanitizeText(value, 1000)).join(" ");
  return CAPABILITY_RULES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

async function githubJson(apiPath, { token = "", fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://api.github.com${apiPath}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "CODEGA-AI-Agent-Watch",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      const error = new Error(`GitHub HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function scanSource(source, options = {}) {
  const { owner, name } = splitRepo(source.repo);
  const encodedRepo = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const repo = await githubJson(`/repos/${encodedRepo}`, options);
  const commits = await githubJson(`/repos/${encodedRepo}/commits?per_page=1`, options);
  let release = null;
  try {
    release = await githubJson(`/repos/${encodedRepo}/releases/latest`, options);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const latestCommit = Array.isArray(commits) ? commits[0] : null;
  const spdx = repo && repo.license ? repo.license.spdx_id : null;
  const policy = sourceTrust.sourcePolicy(source.repo, spdx);
  return {
    id: source.id,
    label: source.label,
    repo: source.repo,
    tier: source.tier,
    url: repo.html_url || `https://github.com/${source.repo}`,
    description: sanitizeText(repo.description),
    license: spdx || "UNKNOWN",
    policy,
    stars: Number(repo.stargazers_count) || 0,
    defaultBranch: repo.default_branch || "main",
    pushedAt: repo.pushed_at || null,
    latestCommit: latestCommit ? {
      sha: latestCommit.sha,
      url: latestCommit.html_url,
      message: sanitizeText(latestCommit.commit && latestCommit.commit.message),
      at: latestCommit.commit && latestCommit.commit.author ? latestCommit.commit.author.date : null,
    } : null,
    latestRelease: release ? {
      tag: release.tag_name || release.name || "release",
      name: sanitizeText(release.name || release.tag_name),
      url: release.html_url,
      publishedAt: release.published_at || null,
    } : null,
  };
}

function buildFindings(previous, current, scannedAt) {
  const findings = [];
  if (!previous) {
    findings.push({
      id: `${current.id}:baseline:${current.latestCommit ? current.latestCommit.sha : scannedAt}`,
      sourceId: current.id,
      source: current.label,
      repo: current.repo,
      kind: "baseline",
      title: `${current.label} izlemeye alindi`,
      detail: current.description || "Ilk kaynak goruntusu kaydedildi.",
      url: current.url,
      policy: current.policy,
      at: scannedAt,
      capabilities: classifyCapabilities(current.description),
    });
    return findings;
  }
  if (current.latestRelease && (!previous.latestRelease || previous.latestRelease.tag !== current.latestRelease.tag)) {
    findings.push({
      id: `${current.id}:release:${current.latestRelease.tag}`,
      sourceId: current.id,
      source: current.label,
      repo: current.repo,
      kind: "release",
      title: `${current.label}: ${current.latestRelease.name || current.latestRelease.tag}`,
      detail: `Yeni surum: ${current.latestRelease.tag}`,
      url: current.latestRelease.url,
      policy: current.policy,
      at: scannedAt,
      capabilities: classifyCapabilities(current.latestRelease.name, current.description),
    });
  }
  if (current.latestCommit && (!previous.latestCommit || previous.latestCommit.sha !== current.latestCommit.sha)) {
    findings.push({
      id: `${current.id}:commit:${current.latestCommit.sha}`,
      sourceId: current.id,
      source: current.label,
      repo: current.repo,
      kind: "commit",
      title: `${current.label} deposunda yeni degisiklik`,
      detail: current.latestCommit.message || current.latestCommit.sha.slice(0, 8),
      url: current.latestCommit.url,
      policy: current.policy,
      at: scannedAt,
      capabilities: classifyCapabilities(current.latestCommit.message, current.description),
    });
  }
  return findings;
}

async function scan(options = {}) {
  const previous = load();
  const scannedAt = Date.now();
  const sources = options.sources || DEFAULT_SOURCES;
  const nextSources = { ...previous.sources };
  const errors = [];
  const newFindings = [];

  const results = await Promise.allSettled(sources.map((source) => scanSource(source, options)));
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const result = results[index];
    if (result.status === "fulfilled") {
      const current = result.value;
      newFindings.push(...buildFindings(previous.sources[source.id], current, scannedAt));
      nextSources[source.id] = current;
      continue;
    }
    try {
      errors.push({ source: source.label, repo: source.repo, message: sanitizeText(result.reason && result.reason.message), at: scannedAt });
    } catch (_e) {}
  }

  const seen = new Set();
  const findings = [...newFindings, ...previous.findings]
    .filter((item) => item && item.id && !seen.has(item.id) && seen.add(item.id))
    .slice(0, 100);
  const state = {
    lastScanAt: scannedAt,
    configuredSourceCount: sources.length,
    sources: nextSources,
    findings,
    errors: errors.slice(0, 30),
  };
  save(state);
  return status(state, newFindings.length);
}

function status(state = load(), newCount = 0) {
  const sourceList = Object.values(state.sources || {});
  return {
    lastScanAt: state.lastScanAt,
    sourceCount: Number(state.configuredSourceCount) || DEFAULT_SOURCES.length,
    healthySources: sourceList.length,
    officialSources: sourceList.filter((item) => item.policy && item.policy.trust === "official").length,
    researchSources: sourceList.filter((item) => item.policy && item.policy.mode === "research-only").length,
    blockedSources: sourceList.filter((item) => item.policy && item.policy.mode === "blocked").length,
    newCount,
    sources: sourceList,
    findings: (state.findings || []).slice(0, 20),
    errors: (state.errors || []).slice(0, 10),
  };
}

module.exports = {
  DEFAULT_SOURCES,
  REUSE_LICENSES,
  buildFindings,
  classifyCapabilities,
  githubJson,
  licensePolicy,
  load,
  save,
  scan,
  scanSource,
  sourcePolicy: sourceTrust.sourcePolicy,
  status,
  storePath,
};
