import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const {
  ollamaRemoteDigest,
  ollamaCheckModelUpdate,
} = require("../src/main/agent/ollama-client");
const { ModelUpdateService } = require("../src/main/agent/model-update-service");
const {
  compareVersions,
  scanModelCatalog,
} = require("../src/main/agent/model-catalog-watch");
const scriptDir = dirname(fileURLToPath(import.meta.url));

const manifest = Buffer.from('{"schemaVersion":2,"config":{"digest":"sha256:test"}}');
const expectedDigest = `sha256:${crypto.createHash("sha256").update(manifest).digest("hex")}`;
const fetchImpl = async () => ({
  ok: true,
  headers: { get: () => null },
  arrayBuffer: async () => manifest,
});

assert.equal(
  await ollamaRemoteDigest("qwen3:8b", { fetchImpl }),
  expectedDigest,
  "official model refs should resolve to a manifest digest",
);
assert.equal(
  (await ollamaCheckModelUpdate({ name: "qwen3:8b", digest: expectedDigest }, { fetchImpl })).updateAvailable,
  false,
  "matching digests must stay current",
);
assert.equal(
  (await ollamaCheckModelUpdate({ name: "qwen3:8b", digest: expectedDigest.replace("sha256:", "") }, { fetchImpl })).updateAvailable,
  false,
  "Ollama digests without the sha256 prefix must be normalized",
);
assert.equal(
  (await ollamaCheckModelUpdate({ name: "qwen3:8b", digest: "sha256:old" }, { fetchImpl })).updateAvailable,
  true,
  "different digests must report an update",
);

let applied = [];
const service = new ModelUpdateService({
  now: () => 1234,
  listModels: async () => [{ name: "qwen3:8b", digest: "sha256:old", size: 42 }],
  checkModel: async (model) => ({
    name: model.name,
    localDigest: model.digest,
    remoteDigest: "sha256:new",
    updateAvailable: true,
    checked: true,
  }),
  updateModel: async (name) => {
    applied.push(name);
    return { status: "ready", model: name };
  },
  checkCatalog: async () => ({
    lastCheck: 1234,
    sources: [{ id: "qwen", latestGeneration: "Qwen3.7" }],
    discoveries: [{ id: "qwen", latestGeneration: "Qwen3.7" }],
    errors: [],
  }),
});

const checked = await service.check();
assert.equal(checked.lastCheck, 1234);
assert.equal(checked.models[0].updateAvailable, true);
assert.equal(checked.catalog.discoveries[0].latestGeneration, "Qwen3.7");
const result = await service.apply("qwen3:8b");
assert.deepEqual(applied, ["qwen3:8b"]);
assert.equal(result.ok, true);

const offlineService = new ModelUpdateService({
  now: () => 2222,
  listModels: async () => null,
  checkCatalog: async () => ({
    lastCheck: 2222,
    sources: [{ id: "qwen", latestGeneration: "Qwen3.6" }],
    discoveries: [],
    errors: [],
  }),
});
const offlineStatus = await offlineService.check();
assert.equal(offlineStatus.lastCheck, 2222);
assert.equal(offlineStatus.catalog.sources[0].id, "qwen", "catalog radar should work while Ollama is offline");
assert.match(offlineStatus.error, /Ollama/i);

assert.ok(compareVersions("Qwen3.7", "Qwen3.6") > 0, "new model generations should compare numerically");
assert.equal(compareVersions("Qwen3.6", "Qwen3.6"), 0);

const catalogResponses = new Map([
  ["/repos/QwenLM/Qwen3.6", { html_url: "https://github.com/QwenLM/Qwen3.6", description: "Qwen", pushed_at: "2026-01-01" }],
  ["/orgs/QwenLM/repos?per_page=100&sort=pushed", [
    { name: "Qwen3.6", html_url: "https://github.com/QwenLM/Qwen3.6", pushed_at: "2026-01-01" },
    { name: "Qwen3.7", html_url: "https://github.com/QwenLM/Qwen3.7", pushed_at: "2026-02-01" },
  ]],
]);
const catalogFetch = async (url) => {
  const parsed = new URL(url);
  const key = parsed.pathname + parsed.search;
  if (key.endsWith("/releases/latest")) {
    return { ok: false, status: 404, json: async () => ({}) };
  }
  return { ok: true, status: 200, json: async () => catalogResponses.get(key) };
};
const catalog = await scanModelCatalog({
  sources: [{
    id: "qwen",
    label: "Qwen",
    repo: "QwenLM/Qwen3.6",
    currentGeneration: "Qwen3.6",
    discoverOrg: "QwenLM",
    generationPattern: /^Qwen(\d+(?:\.\d+)?)$/i,
  }],
  fetchImpl: catalogFetch,
});
assert.equal(catalog.discoveries[0].latestGeneration, "Qwen3.7");

const html = readFileSync(join(scriptDir, "../src/renderer/index.html"), "utf8");
const renderer = readFileSync(join(scriptDir, "../src/renderer/renderer.js"), "utf8");
for (const target of ["models", "agents", "ai", "mcp"]) {
  assert.match(html, new RegExp(`data-settings-target="${target}"`), `health dashboard should link to ${target}`);
}
for (const provider of ["openai", "claude", "gemini"]) {
  assert.match(html, new RegExp(`data-provider-target="${provider}"`), `health dashboard should link to ${provider}`);
}
assert.match(renderer, /g\.open = active/, "settings navigation must open the selected details group");
assert.match(renderer, /updateProviderVisibility\(\)/, "provider navigation must reveal the selected provider fields");

console.log("Model update service OK");
