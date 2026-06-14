"use strict";

const OFFICIAL_MODEL_SOURCES = Object.freeze([
  {
    id: "qwen",
    label: "Qwen",
    repo: "QwenLM/Qwen3.6",
    currentGeneration: "Qwen3.6",
    discoverOrg: "QwenLM",
    generationPattern: /^Qwen(\d+(?:\.\d+)?)$/i,
  },
  { id: "gemma", label: "Google Gemma", repo: "google-deepmind/gemma" },
  { id: "llama", label: "Meta Llama", repo: "meta-llama/llama-models" },
  { id: "mistral", label: "Mistral", repo: "mistralai/mistral-inference" },
]);

function sanitize(value, max = 240) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function versionParts(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)+|\d+)/);
  return match ? match[1].split(".").map((part) => Number(part) || 0) : [];
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta) return delta;
  }
  return 0;
}

async function githubJson(apiPath, { fetchImpl = fetch, token = "", timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://api.github.com${apiPath}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "CODEGA-AI-Model-Radar",
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

async function latestRelease(repo, options) {
  try {
    return await githubJson(`/repos/${repo}/releases/latest`, options);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function discoverGeneration(source, options) {
  if (!source.discoverOrg || !source.generationPattern) return null;
  const repos = await githubJson(`/orgs/${source.discoverOrg}/repos?per_page=100&sort=pushed`, options);
  return (Array.isArray(repos) ? repos : [])
    .filter((repo) => source.generationPattern.test(String(repo.name || "")))
    .sort((left, right) => compareVersions(right.name, left.name))[0] || null;
}

async function scanSource(source, options = {}) {
  const [repo, release, generation] = await Promise.all([
    githubJson(`/repos/${source.repo}`, options),
    latestRelease(source.repo, options),
    discoverGeneration(source, options),
  ]);
  const latestGeneration = generation ? generation.name : source.currentGeneration || null;
  return {
    id: source.id,
    label: source.label,
    repo: source.repo,
    url: generation?.html_url || repo.html_url || `https://github.com/${source.repo}`,
    description: sanitize(generation?.description || repo.description),
    pushedAt: generation?.pushed_at || repo.pushed_at || null,
    currentGeneration: source.currentGeneration || null,
    latestGeneration,
    newerGeneration: !!(
      latestGeneration
      && source.currentGeneration
      && compareVersions(latestGeneration, source.currentGeneration) > 0
    ),
    latestRelease: release ? {
      tag: release.tag_name || release.name || "release",
      name: sanitize(release.name || release.tag_name),
      url: release.html_url,
      publishedAt: release.published_at || null,
    } : null,
  };
}

async function scanModelCatalog(options = {}) {
  const sources = options.sources || OFFICIAL_MODEL_SOURCES;
  const results = await Promise.allSettled(sources.map((source) => scanSource(source, options)));
  const entries = [];
  const errors = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === "fulfilled") entries.push(result.value);
    else errors.push({ source: sources[index].label, message: sanitize(result.reason && result.reason.message) });
  }
  return {
    lastCheck: Date.now(),
    sources: entries,
    discoveries: entries.filter((entry) => entry.newerGeneration),
    errors,
  };
}

module.exports = {
  OFFICIAL_MODEL_SOURCES,
  compareVersions,
  githubJson,
  scanModelCatalog,
  scanSource,
  versionParts,
};
