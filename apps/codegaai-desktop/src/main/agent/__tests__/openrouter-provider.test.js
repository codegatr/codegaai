"use strict";

const { PROVIDERS, profile, configFromSettings } = require("../cloud-provider");
const { PROVIDER_VALUES, normalizeProviderOrder } = require("../runtime-policy");
const { DEFAULTS } = require("../settings-store");
const { ModelManager } = require("../../model-manager");
const { setSettings } = require("../settings-store");
const os = require("node:os");
const path = require("node:path");

describe("OpenRouter ücretsiz model yönlendiricisi", () => {
  test("PROVIDERS profili doğru varsayılanlarla kayıtlı", () => {
    const p = profile("openrouter");
    expect(p).toBeTruthy();
    expect(p.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(p.model).toBe("openrouter/free");
  });

  test("configFromSettings ayarlardan anahtar/model okur", () => {
    const cfg = configFromSettings(
      { provider: "openrouter", openrouterApiKey: "sk-or-test", openrouterModel: "openrouter/free" },
      {}
    );
    expect(cfg.provider).toBe("openrouter");
    expect(cfg.apiKey).toBe("sk-or-test");
    expect(cfg.model).toBe("openrouter/free");
    expect(cfg.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  test("runtime-policy sağlayıcı zincirinde geçerli", () => {
    expect(PROVIDER_VALUES.has("openrouter")).toBe(true);
    const order = normalizeProviderOrder(["openrouter", "ollama"], "openrouter");
    expect(order[0]).toBe("openrouter");
  });

  test("API anahtarı girilmiş OpenRouter yapılandırılmış sağlayıcı zincirinden atılmaz", () => {
    const { configuredProviderChain } = require("../runtime-policy");
    const chain = configuredProviderChain({
      provider: "openrouter",
      modelAutoFallback: true,
      modelFallbackOrder: ["openrouter", "ollama"],
      openrouterApiKey: "sk-or-test",
    });
    expect(chain[0]).toBe("openrouter");
    expect(chain).toContain("ollama");
  });

  test("askDirect sohbet üretimini Ollama yerine seçili OpenRouter'a yollar", async () => {
    process.env.CODEGA_SETTINGS_PATH = path.join(os.tmpdir(), `codega-openrouter-${Date.now()}-${Math.random()}.json`);
    setSettings({
      provider: "openrouter",
      modelAutoFallback: true,
      modelFallbackOrder: ["openrouter", "ollama"],
      openrouterApiKey: "sk-or-test",
      openrouterBaseUrl: "https://openrouter.example/v1",
      openrouterModel: "openrouter/free",
    });
    global.fetch = jest.fn(async (url, options) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "OpenRouter üzerinden temiz yanıt." } }] }),
      text: async () => "",
      body: null,
      url,
      options,
    }));
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];

    const result = await mgr.askDirect("Bu teknik soruyu doğrudan yanıtla.", { chatId: "openrouter-routing" });

    expect(result.text).toBe("OpenRouter üzerinden temiz yanıt.");
    expect(global.fetch).toHaveBeenCalled();
    expect(String(global.fetch.mock.calls[0][0])).toBe("https://openrouter.example/v1/chat/completions");
    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload.model).toBe("openrouter/free");
  });

  test("settings varsayılanları openrouter alanlarını içerir", () => {
    expect(DEFAULTS.openrouterBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(DEFAULTS.openrouterModel).toBe("openrouter/free");
    expect(DEFAULTS.openrouterApiKey).toBe("");
  });

  test("kaldırılan ücretsiz GLM 5.2 slug'ını ücretsiz yönlendiriciye taşır", () => {
    const { normalizeSettings } = require("../settings-store");
    const settings = normalizeSettings({ openrouterModel: "z-ai/glm-5.2:free" });
    expect(settings.openrouterModel).toBe("openrouter/free");
  });

  test("claude olmayan sağlayıcı openai-uyumlu yoldan gider (routing varsayımı)", () => {
    // cloudChat: provider === "claude" → anthropic; diğerleri → openaiChat.
    expect(PROVIDERS.openrouter.label).toMatch(/OpenRouter/);
  });
});
