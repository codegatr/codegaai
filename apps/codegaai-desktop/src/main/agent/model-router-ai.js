"use strict";

function foldTr(input) {
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

function classifyPrompt(input = "") {
  const text = foldTr(input);
  const length = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;

  if (!text) return { intent: "chat", reason: "empty", priority: ["qwen3.5:0.8b", "qwen2.5:1.5b", "qwen3.5:2b"] };

  const codeKeywords = /\b(kod|php|laravel|javascript|typescript|python|sql|api|controller|model|migration|class|function|fonksiyon|debug|stack trace|exception|docker|nginx|apache|github|commit|release)\b/;
  const codeVerbs = /\b(yaz|duzelt|gelistir|olustur|kur|incele|kontrol et|debug|refactor|optimize et)\b/;
  if (codeKeywords.test(text) && codeVerbs.test(text)) {
    return {
      intent: "code",
      reason: "code_keywords_and_delivery_verb",
      priority: ["qwen2.5-coder:3b", "qwen2.5-coder:3b-instruct", "qwen2.5-coder:7b", "qwen2.5-coder:7b-instruct", "qwen3.5:4b"],
    };
  }

  if (/\b(analiz et|raporla|karsilastir|strateji|roadmap|mimari|uzun|detayli|plan cikar|tasarla)\b/.test(text) || length > 1200 || words > 180) {
    return {
      intent: "analysis",
      reason: length > 1200 || words > 180 ? "long_prompt" : "analysis_keywords",
      priority: ["qwen3.5:4b", "qwen3.5:9b", "qwen3:8b", "qwen3:14b", "mistral:7b"],
    };
  }

  if (/\b(nedir|ne demek|kisa acikla|tek cumle|tek cümle|ozetle|özetle|acikla|açıkla)\b/.test(text) && length < 220) {
    return {
      intent: "short_fact",
      reason: "short_explanation",
      priority: ["qwen3.5:0.8b", "qwen2.5:1.5b", "qwen3.5:2b", "qwen2.5:3b", "qwen3.5:4b"],
    };
  }

  if (/\b(selam|merhaba|naber|nasilsin|tesekkur|sagol|tamam|devam)\b/.test(text) && length < 120) {
    return {
      intent: "chat",
      reason: "small_conversation",
      priority: ["qwen3.5:0.8b", "qwen2.5:1.5b", "qwen3.5:2b"],
    };
  }

  return {
    intent: "balanced",
    reason: "default_balanced",
    priority: ["qwen3.5:2b", "qwen2.5:3b", "qwen3.5:4b", "qwen3:4b"],
  };
}

function isInstalled(installed, model) {
  const wanted = foldTr(model);
  return (installed || []).some((item) => {
    const current = foldTr(item);
    return current === wanted || current === `${wanted}:latest`;
  });
}

function routeModels(input, installed, currentModel, fallbackModels = []) {
  const route = classifyPrompt(input);
  const candidates = [];
  const add = (model) => {
    if (!model || candidates.includes(model)) return;
    if (!installed || !installed.length || isInstalled(installed, model)) candidates.push(model);
  };

  for (const model of route.priority) add(model);
  add(currentModel);
  for (const model of fallbackModels) add(model);

  return {
    ...route,
    candidates: candidates.slice(0, 5),
  };
}

module.exports = {
  classifyPrompt,
  routeModels,
  foldTr,
};
