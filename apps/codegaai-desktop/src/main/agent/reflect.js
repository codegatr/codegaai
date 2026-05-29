"use strict";
/**
 * agent/reflect.js
 * -----------------
 * Öz değerlendirme (self-reflection) katmanı.
 *
 * Ajan bir taslak cevap ürettikten sonra, modeli bir "denetçi" rolünde tekrar
 * çalıştırır: cevap doğru/eksiksiz/uydurmasız mı? İyiyse aynen bırakır, değilse
 * düzeltilmiş cevabı döndürür. Bu, "kendi çıktısını kontrol edip hatasını
 * düzeltme" yetisidir.
 *
 * generateFn(messages) -> Promise<string> enjekte edilir (test edilebilirlik).
 * Saf yardımcılar (looksOk, buildCritiqueMessages) modelsiz test edilebilir.
 */

const OK_PATTERN = /^\s*(ok|tamam|doğru|dogru)\b/i;

function looksOk(text) {
  const t = String(text || "").trim();
  return OK_PATTERN.test(t) || t.toLowerCase() === "ok";
}

function buildCritiqueMessages(question, draftAnswer) {
  return [
    {
      role: "system",
      content:
        "Sen titiz bir denetçisin. Bir yapay zekanın cevabını kontrol edip " +
        "gerekiyorsa düzeltirsin. Uydurma bilgi, eksik cevap ve soruyla " +
        "alakasızlık ararsın.",
    },
    {
      role: "user",
      content: [
        `Soru: ${question}`,
        "",
        `Verilen cevap:`,
        draftAnswer,
        "",
        "Görev:",
        "- Cevap doğru, eksiksiz ve uydurma içermiyorsa SADECE 'OK' yaz.",
        "- Sorun varsa (uydurma sayı/isim, eksiklik, konudan sapma) DÜZELTİLMİŞ",
        "  cevabı yaz. Yalnızca düzeltilmiş cevabı yaz; açıklama/önsöz ekleme.",
        "- Emin değilsen cevapta bunu açıkça belirt; uydurma.",
      ].join("\n"),
    },
  ];
}

/**
 * Taslak cevabı denetle; gerekiyorsa düzelt.
 * @returns {Promise<{revised:boolean, answer:string}>}
 */
async function reflect(question, draftAnswer, generateFn) {
  const draft = String(draftAnswer || "").trim();
  if (!draft) return { revised: false, answer: draft };
  let out;
  try {
    out = (await generateFn(buildCritiqueMessages(question, draft))) || "";
  } catch (_e) {
    // denetim başarısız olursa taslağı koru (asla cevabı kaybetme)
    return { revised: false, answer: draft };
  }
  const verdict = out.trim();
  if (!verdict || looksOk(verdict)) {
    return { revised: false, answer: draft };
  }
  return { revised: true, answer: verdict };
}

module.exports = { reflect, looksOk, buildCritiqueMessages };
