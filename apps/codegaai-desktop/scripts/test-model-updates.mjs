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
});

const checked = await service.check();
assert.equal(checked.lastCheck, 1234);
assert.equal(checked.models[0].updateAvailable, true);
const result = await service.apply("qwen3:8b");
assert.deepEqual(applied, ["qwen3:8b"]);
assert.equal(result.ok, true);

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
