"use strict";

/**
 * answer-adequacy.js — Uzun teknik/mimari soru "yeterlilik kapısı".
 *
 * Sorun (Codex teşhisi): uzun mimari/operasyonel soruya (Project Brain +
 * package.json + version.php + dosya kilidi + rollback ...) model bazen
 * alakasız-kısa bir cevap üretiyor (örn. "6 TL"). Bu deterministik cevaplayıcıdan
 * gelmiyor — modelin kendi saçma çıktısı. Eksik koruma: çıktının soruyla ilgili
 * ve yeterli olup olmadığını denetleyen bir kapı.
 *
 * Bu modül SAF (yan etkisiz) ve test edilebilir. Karar: irrelevant_short_answer.
 */

// Mimari/operasyonel anahtar kelimeler (Türkçe + İngilizce).
const ARCH_KEYWORDS = [
  "package.json", "version.php", "manifest.json", "monorepo", "workspace",
  "rollback", "geri al", "atomic", "atomik", "file lock", "dosya kilidi", "lock",
  "dependency", "bağımlılık", "bagimlilik", "refactor", "migration", "migrasyon",
  "project brain", "sürüm çakışması", "surum cakismasi", "version conflict",
  "transaction", "backoff", "preflight", "overrides", "pipeline", "ci/cd",
  "deadlock", "race condition", "idempot",
];

const PURE_NUMERIC_RE = /^\s*[%₺$€]?\s*-?\d+([.,]\d+)?\s*(tl|try|₺|lira|usd|\$|eur|€|%|adet)?\s*[.!…]?\s*$/i;

function lower(s) { return String(s || "").toLowerCase(); }

/** Sorunun içerdiği mimari anahtar kelimeler. */
function technicalSignals(input) {
  const q = lower(input);
  return ARCH_KEYWORDS.filter((k) => q.includes(k.toLowerCase()));
}

/**
 * Uzun/karmaşık teknik soru mu? Kısa "X nedir?" sorularını yanlışlıkla
 * kapsamamak için: ya gerçekten uzun (>250) ya da en az 2 mimari sinyal + makul
 * uzunluk (>120).
 */
function isLongTechnicalQuestion(input) {
  const q = String(input || "");
  if (q.length > 250) return true;
  return technicalSignals(q).length >= 2 && q.length > 120;
}

/** Cevap yetersiz/alakasız mı? (saf sayı/para, ya da çok kısa + hiçbir anahtarı kapsamıyor) */
function isInadequateAnswer(input, answer) {
  const a = String(answer || "").trim();
  if (!a) return true;
  if (PURE_NUMERIC_RE.test(a)) return true; // "6 TL", "42", "%50"
  if (a.length < 80) {
    const al = lower(a);
    const covers = technicalSignals(input).some((k) => al.includes(k.toLowerCase()));
    if (!covers) return true;
  }
  return false;
}

/** Uzun teknik soru + yetersiz cevap → reddet. */
function isIrrelevantShortAnswer(input, answer) {
  return isLongTechnicalQuestion(input) && isInadequateAnswer(input, answer);
}

/** Reddedilen cevap için odaklı yeniden-üretim mesajları. */
function buildFocusedRegenMessages(input) {
  return [
    {
      role: "system",
      content:
        "Bu UZUN bir mimari/operasyonel mühendislik sorusudur. SAYISAL/para/tek-kelime " +
        "kısa cevap VERME. Soruyu somut adımlar, mimari ve gerektiğinde kod örneğiyle " +
        "yanıtla. İlgili kavramları (package.json/version.php güncelleme, dosya kilidi + " +
        "retry/backoff, atomic write → rename, doğrulama, hata olursa staged rollback) " +
        "açıkça ele al. Konu dışına çıkma, soruyu tekrar etme.",
    },
    { role: "user", content: String(input || "") },
  ];
}

const CONTROLLED_RETRY_MESSAGE =
  "Bu uzun mimari soruya konuyla ilgili yeterli bir cevap üretemedim. " +
  "Soruyu daha küçük parçalara bölersen (örn. önce dosya kilidi + retry, sonra atomic write + rollback) " +
  "her birini netçe yanıtlayabilirim.";

module.exports = {
  ARCH_KEYWORDS,
  technicalSignals,
  isLongTechnicalQuestion,
  isInadequateAnswer,
  isIrrelevantShortAnswer,
  buildFocusedRegenMessages,
  CONTROLLED_RETRY_MESSAGE,
};
