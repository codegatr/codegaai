import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const modelModule = await import(pathToFileURL(path.join(root, "src", "main", "model-manager.js")).href);
const { isSmallTalk } = modelModule.default || modelModule;

assert.equal(isSmallTalk("Ne olacak seninle bu halimiz?"), true);
assert.equal(isSmallTalk("Sorunun cevabına devam edebilir misin sence?"), true);
assert.equal(isSmallTalk("Burada mısın?"), true);
assert.equal(isSmallTalk("GitHub reposunu incele ve hataları düzelt"), false);
assert.equal(isSmallTalk("PHP ile REST API kodu yaz"), false);

const ollamaModule = await import(pathToFileURL(path.join(root, "src", "main", "agent", "ollama-client.js")).href);
const { ollamaChatStream } = ollamaModule.default || ollamaModule;
const previousFetch = globalThis.fetch;

globalThis.fetch = async (_url, options = {}) => new Promise((_, reject) => {
  const rejectAbort = () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    reject(error);
  };
  if (options.signal?.aborted) rejectAbort();
  else options.signal?.addEventListener("abort", rejectAbort, { once: true });
});

await assert.rejects(
  () => ollamaChatStream("qwen3:4b", [{ role: "user", content: "test" }], { timeoutMs: 20 }),
  (error) => error && error.name === "TimeoutError"
);

const controller = new AbortController();
const pending = ollamaChatStream("qwen3:4b", [{ role: "user", content: "test" }], {
  timeoutMs: 5000,
  signal: controller.signal,
});
controller.abort();
await assert.rejects(pending, (error) => error && error.name === "AbortError");

globalThis.fetch = previousFetch;
console.log("CODEGA AI chat watchdog OK");
