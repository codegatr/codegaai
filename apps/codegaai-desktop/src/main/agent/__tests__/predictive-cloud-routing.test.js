"use strict";

// Öngörülü bulut yönlendirmesi (alpha.107): bilmece/muhakeme sorusu geldiğinde ve en güçlü
// KURULU yerel model zayıfsa (<7B), yerel HATA beklemeden — yapılandırılmış API-anahtarlı
// bulut sağlayıcı zinciri varsa — soruyu doğrudan buluta yönlendiririz. Konya maden-suyu
// vakası: tek 3-4B model kuruluyken alpha.105 yükseltmesinin hedefi yoktu → kelime salatası.

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const {
  ModelManager,
  isReasoningEscalationCandidate,
  shouldEscalateToCloudForReasoning,
  WEAK_LOCAL_REASONING_THRESHOLD_B,
} = require("../../model-manager");

const KONYA = "Bir adam Konya sıcağında eve dönüyor, elektrikler kesiliyor. Elinde açacak, cebinde çakmak, tezgahta mum var. Maden suyunu içebilmesi için ilk olarak neyi kullanması veya açması gerekir?";

const withClaudeKey = { provider: "ollama", modelFallbackOrder: ["ollama", "claude"], modelAutoFallback: true, claudeApiKey: "sk-ant-test" };
const withoutKey = { provider: "ollama", modelFallbackOrder: ["ollama", "claude"], modelAutoFallback: true, claudeApiKey: "" };

describe("isReasoningEscalationCandidate: paylaşılan muhakeme sinyali", () => {
  test("bilmece/pratik-zekâ sezilir", () => {
    expect(isReasoningEscalationCandidate(KONYA)).toBe(true);
  });
  test("kısa sohbet sezilmez", () => {
    expect(isReasoningEscalationCandidate("Merhaba, bugün nasılsın?")).toBe(false);
  });
});

describe("shouldEscalateToCloudForReasoning: bulut anahtarı × yerel model boyutu matrisi", () => {
  test("zayıf yerel (3B) + Claude anahtarı + bilmece → buluta yönlen", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen2.5:3b"], withClaudeKey);
    expect(d.route).toBe(true);
    expect(d.provider).toBe("claude");
    expect(d.localSize).toBe(3);
    expect(d.threshold).toBe(WEAK_LOCAL_REASONING_THRESHOLD_B);
  });

  test("zayıf yerel (4B) ama bulut anahtarı YOK → yönlenmez (mevcut yerel davranış korunur)", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen2.5:4b"], withoutKey);
    expect(d.route).toBe(false);
    expect(d.reason).toBe("no_cloud_provider");
  });

  test("güçlü yerel (14B) + Claude anahtarı → yönlenmez (yerel yeterli)", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen2.5:3b", "qwen2.5:14b"], withClaudeKey);
    expect(d.route).toBe(false);
    expect(d.reason).toBe("local_strong_enough");
  });

  test("eşik sınırı: tam 7B yerel → yönlenmez (>= eşik yeterli)", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen2.5:7b"], withClaudeKey);
    expect(d.route).toBe(false);
    expect(d.reason).toBe("local_strong_enough");
  });

  test("hiç kurulu model yok + anahtar + bilmece → yönlen (yükseltilecek yerel hedef yok)", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, [], withClaudeKey);
    expect(d.route).toBe(true);
    expect(d.provider).toBe("claude");
  });

  test("muhakeme olmayan girdi (kısa sohbet) + zayıf yerel + anahtar → yönlenmez", () => {
    const d = shouldEscalateToCloudForReasoning("Merhaba, bugün nasılsın?", ["qwen2.5:3b"], withClaudeKey);
    expect(d.route).toBe(false);
    expect(d.reason).toBe("not_reasoning");
  });

  test("autoModelEscalation=false kullanıcı tercihine saygı duyar (anahtar+zayıf olsa da)", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen2.5:3b"], { ...withClaudeKey, autoModelEscalation: false });
    expect(d.route).toBe(false);
    expect(d.reason).toBe("escalation_disabled");
  });

  test("modelAutoFallback=false → zincir yalnız yerel; buluta yönlenmez", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen2.5:3b"], { ...withClaudeKey, modelAutoFallback: false });
    expect(d.route).toBe(false);
    expect(d.reason).toBe("no_cloud_provider");
  });

  test("zincir sırası: ilk API-anahtarlı bulut sağlayıcı seçilir (gemini < claude)", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen2.5:3b"], {
      provider: "ollama",
      modelFallbackOrder: ["ollama", "gemini", "claude"],
      modelAutoFallback: true,
      geminiApiKey: "g-test",
      claudeApiKey: "c-test",
    });
    expect(d.route).toBe(true);
    expect(d.provider).toBe("gemini");
  });

  test("özel eşik (opts.threshold) uygulanır: 9B < 12B eşik → yönlen", () => {
    const d = shouldEscalateToCloudForReasoning(KONYA, ["qwen3.5:9b"], withClaudeKey, { threshold: 12 });
    expect(d.route).toBe(true);
    expect(d.threshold).toBe(12);
  });
});

// Uçtan uca: generate() öngörülü kararı GERÇEK bulut çağrısına bağlar mı? Zayıf yerel +
// Claude anahtarı + bilmecede Ollama'ya HİÇ düşülmeden Claude endpoint'ine gidilmeli.
describe("generate(): öngörülü bulut yönlendirmesi uçtan uca", () => {
  const settingsStore = require("../settings-store");
  let tmpPath;
  let prevEnv;

  beforeEach(() => {
    prevEnv = process.env.CODEGA_SETTINGS_PATH;
    tmpPath = path.join(os.tmpdir(), `codega-settings-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    process.env.CODEGA_SETTINGS_PATH = tmpPath;
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CODEGA_SETTINGS_PATH;
    else process.env.CODEGA_SETTINGS_PATH = prevEnv;
    try { fs.unlinkSync(tmpPath); } catch (_e) {}
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test("zayıf yerel + Claude anahtarı + bilmece → Ollama denenmeden Claude'a gider", async () => {
    settingsStore.setSettings({
      provider: "ollama",
      modelFallbackOrder: ["ollama", "claude"],
      modelAutoFallback: true,
      claudeApiKey: "sk-ant-test",
    });
    const calledUrls = [];
    global.fetch = jest.fn(async (url) => {
      calledUrls.push(String(url));
      return { ok: true, json: async () => ({ content: [{ type: "text", text: "Maden suyunun kapağını açması gerekir." }] }) };
    });

    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:3b"]; // tek zayıf model

    const out = await mgr.generate("qwen2.5:3b", [{ role: "user", content: KONYA }]);
    expect(out).toMatch(/kapağını açması/);
    // Yalnız Claude endpoint'i çağrıldı; yerel Ollama'ya (11434 / /api/*) hiç düşülmedi.
    expect(calledUrls.some((u) => /anthropic\.com\/v1\/messages/.test(u))).toBe(true);
    expect(calledUrls.some((u) => /11434|\/api\/(chat|tags|generate|version)/.test(u))).toBe(false);
  });

  test("bulut anahtarı yokken öngörülü rota tetiklenmez (Claude'a önden gitmez)", async () => {
    settingsStore.setSettings({
      provider: "ollama",
      modelFallbackOrder: ["ollama", "claude"],
      modelAutoFallback: true,
      claudeApiKey: "", // anahtar yok
    });
    const calledUrls = [];
    global.fetch = jest.fn(async (url) => {
      calledUrls.push(String(url));
      // ollamaReachable/ollamaChat: erişilemez taklidi (yerel akış boş döner).
      throw new Error("ECONNREFUSED");
    });

    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:3b"];
    // CLI (ollama run) yolunu determinist kıl: dev makinesinde gerçek binary olsa bile
    // çalıştırma; yerel yol başarısız kabul edilsin (fetch zaten reddediyor).
    mgr.runOllama = async () => ({ ok: false, stdout: "", stderr: "unavailable" });

    const out = await mgr.generate("qwen2.5:3b", [{ role: "user", content: KONYA }]);
    expect(out).toBe(""); // yerel erişilemez + bulut yok → boş
    expect(calledUrls.some((u) => /anthropic\.com/.test(u))).toBe(false);
  });
});
