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
  expertMode: "genel", // sohbet uzman modu (genel/php/python/javascript/devops/finans/hukuk)
  streaming: true, // cevabı token token canlı göster (kapatılabilir)
  provider: "ollama", // "ollama" | "openai" | "claude" | "gemini"
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "", // YALNIZCA yerelde saklanır; kullanıcının kendi sağlayıcısına gider
  openaiModel: "gpt-4o-mini",
  claudeBaseUrl: "https://api.anthropic.com/v1",
  claudeApiKey: "",
  claudeModel: "claude-sonnet-4-20250514",
  geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  continuousLearning: false, // açıkken kaynaklardan sürekli öğren
  learningTopics: "", // virgülle ayrılmış konular (boşsa öğrenilen/kişisel hafızadan türetilir)
  learningSources: "wikipedia,web,github,stackoverflow,arxiv,hackernews,mdn",
  learningSyncRepo: "", // owner/repo — öğrenilenleri buraya yedekle (boşsa yalnız yerel)
  semanticSearch: false, // öğrenilen bilgide anlamsal (embedding) arama; nomic-embed-text gerekir
  embedModel: "nomic-embed-text",
  autoModelUpdates: true, // kurulu resmi Ollama modellerini boşta ve günlük kontrol et
  modelUpdateCheckHours: 24,
  theme: "oled", // görünüm teması (oled/slate/midnight/warm)
  accent: "#f59e0b", // vurgu rengi (prototip amber)
  fontScale: "orta", // sohbet yazı boyutu (kucuk/orta/buyuk)
};

function settingsPath() {
  if (process.env.CODEGA_SETTINGS_PATH) return process.env.CODEGA_SETTINGS_PATH;
  return path.join(os.homedir(), ".codega-ai", "agent-settings.json");
}

function getSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return { ...DEFAULTS, ...raw };
  } catch (_e) {
    return { ...DEFAULTS };
  }
}

function setSettings(patch) {
  const next = { ...getSettings(), ...(patch || {}) };
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
  return next;
}

module.exports = { DEFAULTS, getSettings, setSettings, settingsPath };
