import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = fileURLToPath(new URL("..", import.meta.url));
const modelModule = await import(pathToFileURL(path.join(root, "src", "main", "model-manager.js")).href);
const {
  ModelManager,
  extractWeatherCity,
  isSmallTalk,
  shouldRunHardValidation,
} = modelModule.default || modelModule;

assert.equal(isSmallTalk("Ne olacak seninle bu halimiz?"), true);
assert.equal(isSmallTalk("Sorunun cevabına devam edebilir misin sence?"), true);
assert.equal(isSmallTalk("Burada mısın?"), true);
assert.equal(isSmallTalk("GitHub reposunu incele ve hataları düzelt"), false);
assert.equal(isSmallTalk("Biraz duzelmissin sanki."), true);
assert.equal(isSmallTalk("Bu kez daha iyi olmus."), true);
assert.equal(isSmallTalk("Biraz d\u00fczelmi\u015fsin sanki."), true);
assert.equal(isSmallTalk("PHP ile REST API kodu yaz"), false);
assert.equal(shouldRunHardValidation({
  fastConversation: true,
  taskDecomposition: { applicable: false },
}), false);
assert.equal(shouldRunHardValidation({
  fastConversation: false,
  taskDecomposition: { applicable: false },
}), false);
assert.equal(shouldRunHardValidation({
  fastConversation: false,
  inputNeedsVerification: true,
  taskDecomposition: { applicable: false },
}), true);
assert.equal(extractWeatherCity("Bugün Konya'da hava durumu nasıl?"), "Konya");
assert.equal(extractWeatherCity("Ankara hava nasıl?"), "Ankara");

const casualManager = new ModelManager();
casualManager.state = {
  provider: "ollama",
  status: "ready",
  model: "qwen3:4b",
  task: "chat",
  message: "Hazır",
};
casualManager.installedModels = async () => ["qwen3:4b"];
casualManager.generate = async () => "Evet, biraz toparlandım. Teşekkür ederim.";
const casualAnswer = await casualManager.ask("Biraz düzelmişsin sanki.");
assert.equal(casualAnswer.text, "Evet, biraz toparlandım. Teşekkür ederim.");
assert.doesNotMatch(casualAnswer.text, /Final Answer|doğrulama kapısı/i);

const rendererSource = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");
const helperStart = rendererSource.indexOf("function foldAssistantOutput");
const helperEnd = rendererSource.indexOf("function saveChats");
assert.ok(helperStart >= 0 && helperEnd > helperStart, "chat history cleanup helpers exist");
const rendererHelpers = new Function(
  `${rendererSource.slice(helperStart, helperEnd)}; return { cleanStoredAssistantOutput };`
)();
const dirtyHistory = [
  "Final Answer: TEST: Normal yarış koşullarında birinci sıradaki kişiyi geçemezsin.",
  "TEST: Üç kedi çember şeklinde dizilirse cevap 3 kedidir.",
  "TEST: 100 kapı probleminde 10 kapı açık kalır.",
  "TEST: Üç kedi çember şeklinde dizilirse cevap 3 kedidir.",
  "TEST: İkinci sıradaki kişiyi geçersen ikinci sıraya yükselirsin.",
].join(" | ");
const migratedHistory = rendererHelpers.cleanStoredAssistantOutput(dirtyHistory);
assert.doesNotMatch(migratedHistory, /\bTEST\s*:/i);
assert.doesNotMatch(migratedHistory, /\|/);
assert.equal(migratedHistory.split("\n").length, 4);

const ollamaModule = await import(pathToFileURL(path.join(root, "src", "main", "agent", "ollama-client.js")).href);
const { ollamaChatStream } = ollamaModule.default || ollamaModule;
const previousFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  const value = String(url);
  if (value.includes("geocoding-api.open-meteo.com")) {
    return { ok: true, text: async () => JSON.stringify({
      results: [{ latitude: 37.87, longitude: 32.48, name: "Konya", admin1: "Konya", country: "Türkiye" }],
    }) };
  }
  if (value.includes("api.open-meteo.com")) {
    return { ok: true, text: async () => JSON.stringify({
      current: { temperature_2m: 24, apparent_temperature: 23, weather_code: 1, wind_speed_10m: 12 },
    }) };
  }
  throw new Error(`unexpected fetch: ${value}`);
};
const weatherAnswer = await new ModelManager().ask("Bugün Konya'da hava durumu nasıl?");
assert.equal(weatherAnswer.model, "codega-weather");
assert.match(weatherAnswer.text, /Konya/);
assert.match(weatherAnswer.text, /24 °C/);

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
