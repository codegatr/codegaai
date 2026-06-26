"use strict";

const { detectWakeWord, normalizeVoiceText } = require("./wake-word");

function classifyVoiceCommand(command) {
  const text = normalizeVoiceText(command);
  if (!text) return { intent: "listen", confidence: 0.5 };
  if (/(servis|fiat|otomasyon|proje|erp|crm|yaz|gelistir|gelistir|olustur|olustur)/.test(text)) {
    return { intent: "project", confidence: 0.9 };
  }
  if (/(github|release|surum|sürüm|guncelle|güncelle|tag|push)/.test(text)) {
    return { intent: "release", confidence: 0.8 };
  }
  if (/(model|ollama|indir|kur|hazirla|hazırla)/.test(text)) {
    return { intent: "provisioning", confidence: 0.75 };
  }
  if (/(ac|aç|kapat|calistir|çalıştır|dosya|klasor|klasör)/.test(text)) {
    return { intent: "desktop", confidence: 0.7 };
  }
  return { intent: "chat", confidence: 0.6 };
}

function routeVoiceInput(input, options = {}) {
  const wake = detectWakeWord(input, options.wakeWords);
  const command = wake.detected ? wake.command : normalizeVoiceText(input);
  const classification = classifyVoiceCommand(command);
  return {
    ok: true,
    wakeDetected: wake.detected,
    wakeWord: wake.wakeWord,
    command,
    ...classification,
    source: "voice",
  };
}

function renderVoiceRoute(route) {
  if (!route.wakeDetected && route.intent === "listen") return "Phoenix dinleme için hazır.";
  if (route.intent === "project") return `Phoenix Project Agent hazır: ${route.command}`;
  if (route.intent === "release") return `Phoenix Release Agent hazır: ${route.command}`;
  if (route.intent === "provisioning") return `Phoenix Provisioning Agent hazır: ${route.command}`;
  if (route.intent === "desktop") return `Phoenix Desktop Agent hazır: ${route.command}`;
  return `Phoenix komutu aldı: ${route.command || "dinliyorum"}`;
}

module.exports = {
  classifyVoiceCommand,
  routeVoiceInput,
  renderVoiceRoute,
};
