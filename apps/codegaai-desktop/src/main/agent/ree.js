"use strict";
/**
 * agent/ree.js — Reasoning -> Explanation Engine (REE)
 * ----------------------------------------------------
 * Deterministic explanation layer. It does not change the verified result; it
 * wraps math/logic answers in a short human-readable explanation structure.
 *
 * Pipeline position: Verification -> Interpretation -> [REE] -> MCE -> Response
 */

function trFold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/\u0131/g, "i")
    .replace(/\u011f/g, "g")
    .replace(/\u00fc/g, "u")
    .replace(/\u015f/g, "s")
    .replace(/\u00f6/g, "o")
    .replace(/\u00e7/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasExplanationStructure(answer) {
  const a = trFold(answer);
  return /anlama|understanding/.test(a) && /dogrulama|verification/.test(a) && /final answer|sonuc/.test(a);
}

function finalSegment(answer) {
  const m = String(answer || "").match(/Final Answer:\s*([\s\S]+)$/i);
  return (m ? m[1] : answer).trim();
}

function firstSentence(text) {
  return String(text || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean) || "";
}

function classify(question) {
  const q = trFold(question);
  if (/%|yuzde|zam|indir|tl|fiyat|urun/.test(q)) return "finance";
  if (/olasilik|ihtimal|probability|top cek|kesin/.test(q)) return "probability";
  if (/haric|except|oldu|oldur|yasam|survived/.test(q)) return "trap";
  if (/geciyorsun|gecersin|sira|yarista/.test(q)) return "logic";
  if (/denklem|katinin|x\s*[+\-=]|[0-9]\s*x|sayinin/.test(q)) return "algebra";
  if (/oran|oranti|kat|toplam|pay/.test(q)) return "ratio";
  if (/\d{1,2}:\d{2}|saat|dakika|sure/.test(q)) return "time";
  return "";
}

function shouldExplain(question, answer) {
  if (!String(answer || "").trim()) return false;
  if (hasExplanationStructure(answer)) return false;
  return !!classify(question);
}

function understandingLine(kind) {
  switch (kind) {
    case "finance":
      return "Soru fiyatın ardışık değişimlerden sonra ne olduğunu ve bunun ne anlama geldiğini soruyor.";
    case "probability":
      return "Soru istenen olayın kaç olası durum içinde gerçekleştiğini soruyor.";
    case "trap":
      return "Soru bir dikkat ifadesi içeriyor; 'hariç hepsi' ifadesi kalan sayıyı doğrudan verir.";
    case "logic":
      return "Soru sıralama veya mantık kuralının doğru yorumlanmasını istiyor.";
    case "algebra":
      return "Soru verilen sözel/matematiksel ifadeyi denkleme çevirip sonucu bulmayı istiyor.";
    case "ratio":
      return "Soru toplamı oran/pay modeline göre bölmeyi istiyor.";
    case "time":
      return "Soru iki zaman arasındaki farkın anlaşılır süre olarak verilmesini istiyor.";
    default:
      return "Soru sonucu bulmayı ve bunun neden doğru olduğunu açıklamayı istiyor.";
  }
}

function trapLine(question) {
  const q = trFold(question);
  if (/haric|except/.test(q)) {
    return "Tuzak: toplamdan çıkarmak yerine 'hariç kalanlar' ifadesini hayatta/kalan sayı olarak okumak gerekir.";
  }
  if (/geciyorsun|gecersin/.test(q)) {
    return "Tuzak: geçtiğin kişinin sırasını alırsın; bir sıra daha ileri atlamazsın.";
  }
  return "";
}

function reasoningLine(kind, answer) {
  const first = firstSentence(answer);
  switch (kind) {
    case "finance":
      return first || "Değişimler sırayla uygulanır; yüzde işlemleri başlangıç değerine değil, o andaki değere uygulanır.";
    case "probability":
      return first || "Olasılık, uygun durum sayısının tüm durum sayısına oranıdır.";
    case "trap":
      return first || "Kritik ifade doğru yorumlanınca kalan sayı doğrudan elde edilir.";
    case "logic":
      return first || "Sıralama kuralı doğrudan uygulanır.";
    case "algebra":
      return first || "Bilinmeyen için denklem kurulur ve eşitlik korunarak çözülür.";
    case "ratio":
      return first || "Toplam önce payların toplamına bölünür, sonra her payın değeri hesaplanır.";
    case "time":
      return first || "Zaman farkı önce dakika cinsinden hesaplanır, sonra saat/dakikaya çevrilir.";
    default:
      return first || "Çözüm adımları doğrulanmış sonuçla tutarlıdır.";
  }
}

function verificationLine(kind, finalAnswer) {
  switch (kind) {
    case "finance":
      return "Kontrol: son değer, uygulanan tüm çarpanlar sırayla kullanıldığında elde edilen değerdir.";
    case "probability":
      return "Kontrol: kesir, ondalık/yüzde karşılığıyla aynı sonucu ifade eder.";
    case "trap":
      return "Kontrol: cevap, sorudaki 'hariç' şartını korur ve tersine çevirmez.";
    case "logic":
      return "Kontrol: sonuç, kuralı doğrudan uygulayınca elde edilen sırayla aynıdır.";
    case "algebra":
      return "Kontrol: bulunan değer orijinal ifadeye geri konduğunda eşitlik sağlanır.";
    case "ratio":
      return "Kontrol: parçalar toplama eşittir ve oran/pay ilişkisi bozulmaz.";
    case "time":
      return "Kontrol: süre toplam dakika üzerinden hesaplanıp tekrar saat-dakika biçimine çevrilir.";
    default:
      return `Kontrol: final sonuç "${finalAnswer}" ile tutarlıdır.`;
  }
}

function interpretationLine(answer) {
  const human = String(answer || "").match(/İnsan Yorumu:\s*([\s\S]*?)(?:\n\nFinal Answer:|$)/i);
  if (human) return human[1].replace(/^\s*-\s*/gm, "").trim();
  return "Bu, ham sonucun günlük dilde anlaşılır biçimidir.";
}

function explain(question, answer) {
  const original = String(answer || "").trim();
  if (!shouldExplain(question, original)) return { changed: false, answer: original, confidence: 100 };

  const kind = classify(question);
  const final = finalSegment(original);
  const trap = trapLine(question);
  const body = [
    "Anlama:",
    understandingLine(kind),
    "",
    "İşlem:",
    reasoningLine(kind, original),
    "",
    "Doğrulama:",
    verificationLine(kind, final),
    "",
    "Yorum:",
    interpretationLine(original),
    "",
    `Final Answer: ${final}`,
  ];
  if (trap) body.splice(5, 0, trap, "");
  return { changed: true, answer: body.join("\n").trim(), confidence: 100 };
}

module.exports = {
  explain,
  shouldExplain,
  classify,
  trFold,
};
