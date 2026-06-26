"use strict";

const { normalize, fastPathAnswer } = require("./fast-path");

function classifyIntent(input) {
  const text = normalize(input);
  const fast = fastPathAnswer(input);
  if (fast.hit) {
    return {
      intent: fast.intent,
      route: "fast_path",
      confidence: 1,
      fastAnswer: fast.answer,
      needsModel: false,
    };
  }

  if (/(zip|sikistirilmis|sıkıştırılmış).*(ac|aç|duzenle|düzenle|guncelle|güncelle|ver|olustur|oluştur)/.test(text)) {
    return { intent: "project.zip", route: "builder", confidence: 0.9, needsModel: false };
  }
  if (/(ates fiat|ateş fiat|servis otomasyon|fiat servis|is emri|iş emri).*(gelistir|geliştir|olustur|oluştur|yap|kur|hazirla|hazırla|uret|üret)/.test(text)) {
    return { intent: "project.generate", route: "project_builder", confidence: 0.95, needsModel: false };
  }
  if (/(php|python|javascript|typescript|sql|api|controller|migration|login|giris|giriş).*(yaz|gelistir|geliştir|olustur|oluştur|kod|ornek|örnek)/.test(text)) {
    return { intent: "code.generate", route: "code_agent", confidence: 0.85, needsModel: true };
  }
  if (/(github|release|surum|sürüm|tag|push|workflow|actions)/.test(text)) {
    return { intent: "release.manage", route: "release_agent", confidence: 0.8, needsModel: false };
  }
  if (/(model|ollama|qwen|llama|mistral).*(indir|kur|hazirla|hazırla|guncelle|güncelle)/.test(text)) {
    return { intent: "model.provision", route: "provisioning", confidence: 0.8, needsModel: false };
  }
  if (/(nedir|ne demek|kisaca|kısaca|acikla|açıkla)/.test(text) && text.length < 160) {
    return { intent: "knowledge.lookup", route: "knowledge", confidence: 0.65, needsModel: true };
  }
  return { intent: "chat.general", route: "model", confidence: 0.5, needsModel: true };
}

module.exports = {
  classifyIntent,
};
