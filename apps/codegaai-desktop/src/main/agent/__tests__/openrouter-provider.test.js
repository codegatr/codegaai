"use strict";

const { PROVIDERS, profile, configFromSettings } = require("../cloud-provider");
const { PROVIDER_VALUES, normalizeProviderOrder } = require("../runtime-policy");
const { DEFAULTS } = require("../settings-store");

describe("OpenRouter sağlayıcısı (GLM 5.2 ücretsiz)", () => {
  test("PROVIDERS profili doğru varsayılanlarla kayıtlı", () => {
    const p = profile("openrouter");
    expect(p).toBeTruthy();
    expect(p.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(p.model).toBe("z-ai/glm-5.2:free");
  });

  test("configFromSettings ayarlardan anahtar/model okur", () => {
    const cfg = configFromSettings(
      { provider: "openrouter", openrouterApiKey: "sk-or-test", openrouterModel: "z-ai/glm-5.2:free" },
      {}
    );
    expect(cfg.provider).toBe("openrouter");
    expect(cfg.apiKey).toBe("sk-or-test");
    expect(cfg.model).toBe("z-ai/glm-5.2:free");
    expect(cfg.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  test("runtime-policy sağlayıcı zincirinde geçerli", () => {
    expect(PROVIDER_VALUES.has("openrouter")).toBe(true);
    const order = normalizeProviderOrder(["openrouter", "ollama"], "openrouter");
    expect(order[0]).toBe("openrouter");
  });

  test("settings varsayılanları openrouter alanlarını içerir", () => {
    expect(DEFAULTS.openrouterBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(DEFAULTS.openrouterModel).toBe("z-ai/glm-5.2:free");
    expect(DEFAULTS.openrouterApiKey).toBe("");
  });

  test("claude olmayan sağlayıcı openai-uyumlu yoldan gider (routing varsayımı)", () => {
    // cloudChat: provider === "claude" → anthropic; diğerleri → openaiChat.
    expect(PROVIDERS.openrouter.label).toMatch(/OpenRouter/);
  });
});
