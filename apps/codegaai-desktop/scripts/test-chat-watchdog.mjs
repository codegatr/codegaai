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
  isInteractiveSoftwareRequest,
  isSmallTalk,
  isTechnicalDiagnostic,
  shouldUseMultiAgent,
  shouldRunHardValidation,
  softwareDeliveryPlan,
  wantsExplicitMultiAgent,
} = modelModule.default || modelModule;

assert.equal(isSmallTalk("Ne olacak seninle bu halimiz?"), true);
assert.equal(isSmallTalk("Sorunun cevabına devam edebilir misin sence?"), true);
assert.equal(isSmallTalk("Burada mısın?"), true);
assert.equal(isSmallTalk("GitHub reposunu incele ve hataları düzelt"), false);
assert.equal(isSmallTalk("Biraz duzelmissin sanki."), true);
assert.equal(isSmallTalk("Bu kez daha iyi olmus."), true);
assert.equal(isSmallTalk("Biraz d\u00fczelmi\u015fsin sanki."), true);
assert.equal(isSmallTalk("S\u0131navlara haz\u0131r m\u0131s\u0131n?"), true);
assert.equal(isSmallTalk("Yar\u0131na haz\u0131r m\u0131s\u0131n?"), true);
assert.equal(isSmallTalk("PHP ile REST API kodu yaz"), false);
assert.equal(isTechnicalDiagnostic("POST /admin/login.php 500 Internal Server Error"), true);
const softwarePrompt = "Arac Sigorta ve Muayene Takip Sistemi gelistir. PHP Laravel + Flutter kullan. Clean Architecture uygula. Once analiz yap, sonra veritabani tasarimi olustur, ardindan API'leri gelistir.";
assert.equal(isInteractiveSoftwareRequest(softwarePrompt), true);
assert.equal(wantsExplicitMultiAgent(softwarePrompt), false);
assert.equal(shouldUseMultiAgent({ multiAgent: true }, softwarePrompt), false);
assert.equal(shouldUseMultiAgent({ multiAgent: true }, `${softwarePrompt} Uzman ajanlardan olusan bir ajan ekibi kullan.`), true);
assert.equal(softwareDeliveryPlan().length, 5);
assert.equal(isTechnicalDiagnostic("Sınavlara hazır mısın?"), false);
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
assert.equal(shouldRunHardValidation({
  fastConversation: false,
  technicalDiagnostic: true,
  inputNeedsVerification: true,
  taskDecomposition: { applicable: false },
}), false);
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

casualManager.generate = async () => "Haz\u0131r\u0131m. Sorular\u0131 g\u00f6nder, birlikte \u00e7\u00f6zelim.";
const examAnswer = await casualManager.ask("S\u0131navlara haz\u0131r m\u0131s\u0131n?");
assert.equal(examAnswer.text, "Haz\u0131r\u0131m. Sorular\u0131 g\u00f6nder, birlikte \u00e7\u00f6zelim.");
assert.doesNotMatch(examAnswer.text, /Final Answer|do\u011frulama kap\u0131s\u0131/i);

const diagnosticManager = new ModelManager();
diagnosticManager.state = {
  provider: "ollama",
  status: "ready",
  model: "qwen3:4b",
  task: "code",
  message: "Haz\u0131r",
};
diagnosticManager.installedModels = async () => ["qwen3:4b"];
diagnosticManager.generate = async () => (
  "HTTP 500 sunucu tarafl\u0131 bir hatad\u0131r. \u00d6nce PHP hata g\u00fcnl\u00fc\u011f\u00fcn\u00fc ve login.php i\u00e7indeki veritaban\u0131 ba\u011flant\u0131s\u0131n\u0131 kontrol et."
);
const diagnosticAnswer = await diagnosticManager.ask(
  "POST https://example.com/admin/login.php net::ERR_HTTP_RESPONSE_CODE_FAILURE 500 Internal Server Error"
);
assert.match(diagnosticAnswer.text, /HTTP 500/);
assert.doesNotMatch(diagnosticAnswer.text, /Final Answer|do\u011frulama kap\u0131s\u0131|\u00c7al\u0131\u015fma \u00f6zeti/i);

const softwareManager = new ModelManager();
softwareManager.state = {
  provider: "ollama",
  status: "ready",
  model: "qwen3:4b",
  task: "code",
  message: "Hazir",
};
softwareManager.installedModels = async () => ["qwen3:4b"];
let softwareGenerateCalls = 0;
softwareManager.generate = async () => {
  softwareGenerateCalls += 1;
  return "Once kapsami netlestirip domain modelini kuracagim; ardindan Laravel API ve Flutter istemcisini Clean Architecture katmanlariyla gelistirecegim.";
};
const softwareAnswer = await softwareManager.ask(softwarePrompt);
assert.match(softwareAnswer.text, /Laravel API/);
assert.equal(softwareGenerateCalls, 1, "interactive software requests must start with one direct model call");

const rendererSource = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "src", "main", "preload.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
assert.match(preloadSource, /onChatStatus/);
assert.match(mainSource, /chat:status/);
assert.match(rendererSource, /onChatStatus\(\(status\) => \{[\s\S]*?_kickWatchdog\(\)/);
assert.match(rendererSource, /kind === "ignored"[\s\S]*?_kickWatchdog\(\)/);
assert.match(rendererSource, /idleMs = 135000, hardMs = 300000/);
assert.doesNotMatch(rendererSource, /placeholder\.text\s*=\s*this\.progress/);
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
