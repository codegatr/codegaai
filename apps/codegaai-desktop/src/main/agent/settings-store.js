"use strict";
/**
 * agent/settings-store.js
 * ------------------------
 * Ajan davranış ayarları (kalıcı JSON). Electron'a bağımlı değil → test edilebilir.
 * Dosya yolu process.env.CODEGA_SETTINGS_PATH ile verilir; yoksa ev dizinine düşer.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const runtimePolicy = require("./runtime-policy");

const DEFAULTS = {
  autonomousLearning: true, // kullanıcı hakkında öğren + hatırla
  humanTone: true, // daha insansı, sıcak üslup
  federation: false, // federe ağ (deneysel, varsayılan kapalı)
  githubToken: "", // kullanıcı girer; YALNIZCA yerel userData'da saklanır
  knowledgeRepo: "", // "owner/repo" — öğrenilenlerin kaydedileceği AYRI bilgi reposu
  knowledgeBranch: "main",
  knowledgePath: "knowledge/codega-learnings.jsonl",
  idleLearning: false, // boşta öğrenilenleri GitHub'a senkronla (opt-in, sadece NOT)
  ragEnabled: true, // semantik bellek/doküman getirimi (RAG)
  embedModel: "nomic-embed-text",
  distillLearning: false,
  debugLogging: false,
  deepReasoning: false,
  sacvDebug: false, // SACV warning-mode: bloklamaz, tanı loglar // ağır çok-turlu LLM doğrulaması (yavaş; varsayılan kapalı) // her sohbet isteğini Log Merkezi'ne yaz (ayrıntılı) // öğrenilen ham notları modelle kısa özete indir (Ollama/model gerekir)
  mcpServerUrl: "", // ajana bağlanacak MCP sunucu URL
  mcpAutoTools: false, // açıkken MCP sunucu araçları ajanın araç döngüsüne eklenir // Ollama embedding modeli
  selfReflection: false, // cevabı denetleyip düzelt (yavaş; opt-in)
  planner: false, // karmaşık hedefleri alt adımlara böl (opt-in)
  multiAgent: false, // orchestrator + uzman ajanlar (opt-in, deneysel, yavaş)
  selfMaintenance: true, // açıkken güvenli kendi-kendine bakım/onarım (kod değiştirmez)
  autoProposePR: false, // ajan kendi gözlemlerinden OTONOM PR açsın (ayrı dal; ASLA merge/main)
  autonomousDevelopment: false, // kod okuma + ayrı dalda değişiklik + taslak PR
  autonomousDevelopmentSchedule: false, // gözlenen sorunlardan boşta ve zaman aralıklı taslak PR üret
  autonomousDevelopmentRepo: "",
  autonomousDevelopmentPaths: "",
  autonomousDevelopmentIntervalHours: 24,
  autonomousDevelopmentLastRun: 0,
  autonomousDevelopmentLastResult: "",
  expertMode: "genel", // sohbet uzman modu (genel/php/python/javascript/devops/finans/hukuk)
  streaming: true, // cevabı token token canlı göster (kapatılabilir)
  provider: "ollama", // "ollama" | "openai" | "claude" | "gemini"
  modelAutoFallback: true,
  modelFallbackOrder: ["ollama", "openai", "claude", "gemini"],
  trustedFolders: [],
  toolPermissions: {
    network: "allow",
    mcp: "ask",
    codeExecution: "ask",
    autonomousDevelopment: "ask",
  },
  remoteToolsDeviceName: "",
  scheduledTasksEnabled: true,
  modelStoragePath: "", // Ollama model dosyalarının kullanıcı tarafından seçilen kalıcı dizini
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "", // YALNIZCA yerelde saklanır; kullanıcının kendi sağlayıcısına gider
  openaiModel: "gpt-4o-mini",
  claudeBaseUrl: "https://api.anthropic.com/v1",
  claudeApiKey: "",
  claudeModel: "claude-opus-4-8",
  geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  continuousLearning: false, // açıkken kaynaklardan sürekli öğren
  agentWatch: true, // güvenilir AI ajan depolarını GitHub üzerinden izle
  agentWatchIntervalHours: 6,
  learningTopics: "", // virgülle ayrılmış konular (boşsa öğrenilen/kişisel hafızadan türetilir)
  learningSources: "wikipedia,web,github,stackoverflow,arxiv,hackernews,mdn",
  learningSyncRepo: "", // owner/repo — öğrenilenleri buraya yedekle (boşsa yalnız yerel)
  learningSyncBranch: "codega-knowledge", // öğrenme notları üretim dalına yazılmaz
  semanticSearch: false, // öğrenilen bilgide anlamsal (embedding) arama; nomic-embed-text gerekir
  embedModel: "nomic-embed-text",
  autoModelUpdates: true, // kurulu resmi Ollama modellerini boşta ve günlük kontrol et
  modelUpdateCheckHours: 24,
  theme: "oled", // görünüm teması (oled/slate/midnight/warm)
  accent: "#f59e0b", // vurgu rengi (prototip amber)
  fontScale: "orta", // sohbet yazı boyutu (kucuk/orta/buyuk)
  notifications: false, // sistem bildirimleri: AI cevabi hazir oldugunda OS bildirimi gonder
};

function settingsPath() {
  if (process.env.CODEGA_SETTINGS_PATH) return process.env.CODEGA_SETTINGS_PATH;
  return path.join(os.homedir(), ".codega-ai", "agent-settings.json");
}

function getSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return normalizeSettings({ ...DEFAULTS, ...raw });
  } catch (_e) {
    return normalizeSettings({ ...DEFAULTS });
  }
}

function setSettings(patch) {
  const current = getSettings();
  const incoming = patch || {};
  const next = normalizeSettings({
    ...current,
    ...incoming,
    toolPermissions: {
      ...(current.toolPermissions || {}),
      ...(incoming.toolPermissions || {}),
    },
  });
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
  return next;
}

// Emekli edilen/edilecek Claude modelleri → güncel varsayılana taşınır.
// claude-sonnet-4-20250514 Haziran 2026'da emekli ediliyor; eski kayıtlı
// ayarlardaki değer normalize sırasında otomatik güncellenir.
const RETIRED_CLAUDE_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-7-sonnet-20250219",
]);

function normalizeSettings(settings) {
  const next = { ...settings };
  next.trustedFolders = runtimePolicy.normalizeTrustedFolders(next.trustedFolders);
  next.modelFallbackOrder = runtimePolicy.normalizeProviderOrder(next.modelFallbackOrder, next.provider);
  if (RETIRED_CLAUDE_MODELS.has(String(next.claudeModel || "").trim())) {
    next.claudeModel = DEFAULTS.claudeModel;
  }
  next.remoteToolsDeviceName = String(next.remoteToolsDeviceName || runtimePolicy.defaultDeviceName()).trim();
  next.toolPermissions = {
    ...DEFAULTS.toolPermissions,
    ...(next.toolPermissions || {}),
  };
  for (const key of Object.keys(next.toolPermissions)) {
    next.toolPermissions[key] = runtimePolicy.normalizePermission(
      next.toolPermissions[key],
      DEFAULTS.toolPermissions[key] || "ask",
    );
  }
  return next;
}

module.exports = { DEFAULTS, getSettings, setSettings, settingsPath, normalizeSettings };
