import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const storageModule = await import(pathToFileURL(
  path.join(root, "src", "main", "agent", "model-storage.js")
).href);
const {
  directoryStats,
  discoverModelStorage,
  moveModelStorage,
  validateMove,
} = storageModule.default || storageModule;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codega-model-storage-"));
const source = path.join(temp, "source");
const target = path.join(temp, "target");
fs.mkdirSync(path.join(source, "blobs"), { recursive: true });
fs.mkdirSync(path.join(source, "manifests", "registry"), { recursive: true });
fs.writeFileSync(path.join(source, "blobs", "sha256-test"), "model-data", "utf8");
fs.writeFileSync(path.join(source, "manifests", "registry", "latest"), "manifest", "utf8");

assert.throws(() => validateMove(source, source), /aynı/);
assert.throws(() => validateMove(source, path.join(source, "nested")), /içinde/);

const fakeHome = path.join(temp, "home");
const ollamaDefault = path.join(fakeHome, ".ollama", "models");
const emptyConfigured = path.join(temp, "empty-codega-models");
fs.mkdirSync(path.join(ollamaDefault, "blobs"), { recursive: true });
fs.mkdirSync(path.join(ollamaDefault, "manifests"), { recursive: true });
fs.mkdirSync(emptyConfigured, { recursive: true });
fs.writeFileSync(path.join(ollamaDefault, "blobs", "sha256-real"), "real-model", "utf8");
const discoveredDefault = await discoverModelStorage({
  configuredPath: emptyConfigured,
  environmentPath: "",
  home: fakeHome,
  platform: "win32",
  codegaDefaultPath: emptyConfigured,
});
assert.equal(discoveredDefault.path, ollamaDefault);
assert.equal(discoveredDefault.files, 1);
assert.equal(discoveredDefault.source, "ollama-default");

fs.mkdirSync(path.join(emptyConfigured, "blobs"), { recursive: true });
fs.writeFileSync(path.join(emptyConfigured, "blobs", "sha256-configured"), "configured-model", "utf8");
const discoveredConfigured = await discoverModelStorage({
  configuredPath: emptyConfigured,
  environmentPath: "",
  home: fakeHome,
  platform: "win32",
  codegaDefaultPath: emptyConfigured,
});
assert.equal(discoveredConfigured.path, emptyConfigured);
assert.equal(discoveredConfigured.source, "configured");

const before = await directoryStats(source);
const progress = [];
const result = await moveModelStorage(source, target, {
  onProgress: (event) => progress.push(event.phase),
});
assert.equal(result.ok, true);
assert.equal(fs.existsSync(source), false);
assert.equal(fs.readFileSync(path.join(target, "blobs", "sha256-test"), "utf8"), "model-data");
assert.deepEqual(await directoryStats(target), before);
assert.deepEqual(progress, ["copying", "verifying", "cleaning", "complete"]);

fs.rmSync(temp, { recursive: true, force: true });
console.log("CODEGA AI model storage migration OK");
