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

function analyzePrompt(input) {
  const text = fold(input);
  const wordCount = text ? text.split(/\s+/).length : 0;
  const charCount = text.length;

  const hasCode = /\b(php|laravel|javascript|typescript|python|sql|api|docker|github|commit|release|debug|fonksiyon|class|controller|migration|html|css)\b/.test(text);
  const asksBuild = /\b(yaz|yap|gelistir|olustur|kur|duzelt|refactor|optimize|kontrol et|incele)\b/.test(text);
  const asksShort = /\b(nedir|ne demek|tek cumle|kisa acikla|kisaca|ozetle)\b/.test(text) && charCount < 260;
  const asksAnalysis = /\b(analiz et|mimari|roadmap|strateji|karsilastir|detayli|plan cikar|tasarla)\b/.test(text) || charCount > 1200 || wordCount > 180;
  const smallTalk = /\b(selam|merhaba|naber|nasilsin|tesekkur|sagol|tamam|devam)\b/.test(text) && charCount < 120;

  if (hasCode && asksBuild) return { intent: "code", reason: "code_delivery", wordCount, charCount };
  if (asksAnalysis) return { intent: "analysis", reason: charCount > 1200 || wordCount > 180 ? "long_prompt" : "analysis_keyword", wordCount, charCount };
  if (asksShort) return { intent: "short_fact", reason: "short_fact", wordCount, charCount };
  if (smallTalk) return { intent: "chat", reason: "smalltalk", wordCount, charCount };
  return { intent: "balanced", reason: "default", wordCount, charCount };
}

module.exports = {
  analyzePrompt,
  fold,
};
