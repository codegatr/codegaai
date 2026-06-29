"use strict";

/**
 * sanitize-prompt.js — Yerel modele (Ollama) gitmeden ÖNCE kullanıcı mesajından
 * asistanın KENDİ ADINI temizleyen girdi-katmanı (input middleware).
 *
 * NEDEN: Yerel modelin ağırlıklarına "Ben CODEGA AI..." personası derin kazınmış
 * (strong prior / attention saturation). Sistem promptu bunu her zaman ezemiyor;
 * model girdide kendi adını görünce mantıksal akışı kesip ezberlenmiş tanıtıma
 * sapıyor. Çözüm: model adını GÖRMESİN.
 *
 * AMA körü körüne silmek iki şeyi bozar — bu modül bunları korur:
 *   1. KİMLİK SORUSU ("Sen kimsin?", "CODEGA AI nedir?", "adın ne?") → DOKUNMA.
 *      Aksi halde kullanıcı asistanı sorduğunda cevap veremez.
 *   2. TÜRKÇE EKLER ("CODEGA AI'ın", "CODEGA AI'yı", "CODEGA AI'nin") → ek korunur,
 *      sadece ad+kesme işareti düşürülür, cümle bozulmaz.
 *
 * Kullanıcı arayüzde adıyla hitap etme konforunu korur; transcript değişmez,
 * yalnızca modele giden kopya temizlenir.
 */

// Ad çekirdeği: "codega ai", "codega-ai", "codega_ai", "codegaai" (büyük/küçük duyarsız)
const NAME_CORE = "codega[\\s_-]*ai";

// Kullanıcı asistanın KENDİSİNİ/kimliğini mi soruyor? Öyleyse ada dokunma.
const IDENTITY_QUESTION = new RegExp(
  "(kimsin|kim\\s|kimdir|ad[ıi]n\\s*(ne|nedir)|nedir|ne\\s*demek|kendini\\s*tan[ıi]t|" +
  "who\\s*are\\s*you|what'?s?\\s*your\\s*name|introduce\\s*yourself|what\\s*is\\s*" + NAME_CORE + ")",
  "i"
);

// Türkçe ek harfleri (JS \w bunları kapsamaz: ı, ğ, ş, ö, ü, ç, İ ...).
const TR_SUFFIX = "[a-zA-Z0-9çğıöşüÇĞİÖŞÜ]+";

// Baştaki hitap (vocative): "Hey CODEGA AI,", "Merhaba CODEGA AI:", "CODEGA AI -",
// "CODEGA AI'ın ..." — baştaki ad + (varsa) Türkçe eki birlikte düşürülür.
const LEADING_VOCATIVE = new RegExp(
  "^\\s*(hey|hi|merhaba|selam|ok|okay|tamam|peki)?[\\s,]*" + NAME_CORE + "\\b(['’`]" + TR_SUFFIX + ")?[\\s,:;.\\-—]*",
  "i"
);

// Cümle içi/sondaki ÇIPLAK ad (hitap). Kesme-ekli "CODEGA AI'ın" gibi konu/özne
// kullanımına DOKUNMA (negatif ileri-bakış): bunlar asistana atıftır, tetik değil.
const NAME_BARE = new RegExp("\\b" + NAME_CORE + "\\b(?!['’`])[,:]?", "gi");

/**
 * Kullanıcı mesajını modele iletmeden önce temizler.
 * @param {string} userPrompt
 * @returns {string}
 */
function sanitizePrompt(userPrompt) {
  if (!userPrompt || typeof userPrompt !== "string") return userPrompt;

  // 1. Kimlik sorusuysa dokunma — kullanıcı bilerek asistanı soruyor.
  if (IDENTITY_QUESTION.test(userPrompt) && new RegExp(NAME_CORE, "i").test(userPrompt)) {
    return userPrompt;
  }
  // "Sen kimsin?" gibi ad geçmeyen kimlik sorusu da dokunulmamalı (zaten ad yok).

  let out = userPrompt;

  // 2. Baştaki hitabı (varsa Türkçe ekiyle) kaldır ("CODEGA AI, ...", "CODEGA AI'ın ...").
  out = out.replace(LEADING_VOCATIVE, "");

  // 3. Kalan çıplak (eksiz) ad geçişlerini kaldır — kesme-ekli konu kullanımı korunur.
  out = out.replace(NAME_BARE, "");

  // 5. Temizlik: çift boşluk, baştaki noktalama/boşluk.
  out = out.replace(/\s{2,}/g, " ").replace(/^[\s,:;.\-—]+/, "").trim();

  // 6. İlk harfi büyüt (dilbilgisi tutarlılığı, Türkçe yerel).
  if (out.length) out = out.charAt(0).toLocaleUpperCase("tr-TR") + out.slice(1);

  // 7. Her şey silindiyse (kullanıcı sadece "CODEGA AI" yazdıysa) orijinali döndür —
  //    modele boş mesaj gitmesin.
  return out.length ? out : userPrompt;
}

/** Mesajın asistanın adını içerip içermediği (telemetri/log için, ucuz kontrol). */
function mentionsAssistantName(text) {
  return new RegExp(NAME_CORE, "i").test(String(text || ""));
}

module.exports = { sanitizePrompt, mentionsAssistantName };
