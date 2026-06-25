"use strict";

function fold(input) {
  return String(input || "")
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDomain(text) {
  if (/\b(servis|fiat|arac|araç|is emri|iş emri|otomasyon)\b/.test(text)) return "service_automation";
  if (/\b(erp|cari|stok|fatura|muhasebe)\b/.test(text)) return "erp";
  if (/\b(login|giris|giriş|auth|kimlik)\b/.test(text)) return "authentication";
  if (/\b(web sitesi|site|landing|portal)\b/.test(text)) return "web_platform";
  return "general";
}

function detectLanguage(text) {
  if (/\bphp|laravel\b/.test(text)) return "php";
  if (/\bpython\b/.test(text)) return "python";
  if (/\bjavascript|node|typescript\b/.test(text)) return "javascript";
  return "unknown";
}

function detectIntent(text) {
  if (/\b(olustur|oluştur|gelistir|geliştir|yaz|kur|hazirla|hazırla|uygula)\b/.test(text)) return "build";
  if (/\b(planla|analiz|mimari|tasarla)\b/.test(text)) return "plan";
  if (/\b(duzelt|düzelt|hata|bug|calismiyor|çalışmıyor)\b/.test(text)) return "fix";
  return "answer";
}

function createTask(input, options = {}) {
  const raw = String(input || "").trim();
  const text = fold(raw);
  const intent = detectIntent(text);
  const domain = detectDomain(text);
  const language = detectLanguage(text);
  const database = /\b(mariadb|mysql)\b/.test(text) || language === "php" ? "mariadb" : "unknown";
  const needsFiles = intent === "build" || /\b(proje|sistem|otomasyon|uygulama)\b/.test(text);

  return {
    id: options.taskId || `TASK-${Date.now().toString(36).toUpperCase()}`,
    title: raw.slice(0, 120) || "Yeni Phoenix görevi",
    raw,
    intent,
    domain,
    language,
    database,
    priority: intent === "build" ? "high" : "normal",
    needsFiles,
    needsPlanning: intent === "build" || intent === "plan",
    needsReview: intent === "build" || intent === "fix",
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  createTask,
};
