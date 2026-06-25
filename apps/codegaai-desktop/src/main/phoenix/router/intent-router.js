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

function routeIntent(input) {
  const text = fold(input);
  const wordCount = text ? text.split(/\s+/).length : 0;
  const charCount = text.length;

  const code = /\b(php|laravel|javascript|typescript|python|sql|api|html|css|docker|github|commit|release|terminal|kod|fonksiyon|class|controller|migration)\b/.test(text);
  const build = /\b(yaz|olustur|gelistir|duzelt|kur|refactor|optimize|ornek|ornegi|hazirla)\b/.test(text);
  const research = /\b(arastir|internet|web arama|kaynak|haber|guncel)\b/.test(text);
  const design = /\b(gorsel|logo|afis|tasarim|ui|ux|renk|mockup|animasyon)\b/.test(text);
  const analysis = /\b(analiz|rapor|mimari|strateji|roadmap|karsilastir|detayli|plan)\b/.test(text) || wordCount > 180 || charCount > 1200;
  const shortFact = /\b(nedir|ne demek|tek cumle|kisa acikla|kisaca|ozetle)\b/.test(text) && charCount < 260;

  if (design) return { type: "design", reason: "design_keywords", wordCount, charCount };
  if (research) return { type: "research", reason: "research_keywords", wordCount, charCount };
  if (code && build) return { type: "code", reason: "code_build_request", wordCount, charCount };
  if (analysis) return { type: "analysis", reason: "analysis_or_long_prompt", wordCount, charCount };
  if (shortFact) return { type: "short_fact", reason: "short_fact", wordCount, charCount };
  return { type: "chat", reason: "default_chat", wordCount, charCount };
}

module.exports = {
  fold,
  routeIntent,
};
