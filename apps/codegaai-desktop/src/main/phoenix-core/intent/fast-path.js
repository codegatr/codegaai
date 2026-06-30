"use strict";

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/[ğ]/g, "g")
    .replace(/[ü]/g, "u")
    .replace(/[ş]/g, "s")
    .replace(/[ö]/g, "o")
    .replace(/[ç]/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function calculatorAnswer(text) {
  const q = normalize(text).replace(/ /g, "");
  if (/^2\+2(?:kaceder|nedir)?\??$/.test(q)) return "4";
  const simple = q.match(/^(\d+(?:[.,]\d+)?)([+\-*/x])(\d+(?:[.,]\d+)?)\??$/);
  if (!simple) return "";
  const a = Number(simple[1].replace(",", "."));
  const b = Number(simple[3].replace(",", "."));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const op = simple[2] === "x" ? "*" : simple[2];
  if (op === "+") return String(a + b);
  if (op === "-") return String(a - b);
  if (op === "*") return String(a * b);
  if (op === "/") return b === 0 ? "Sıfıra bölme yapılamaz." : String(a / b);
  return "";
}

// Yaygın selamlaşma/nezaket ifadeleri → modele GİTMEDEN anında yanıt.
// q: normalize edilmiş (küçük harf, TR karakter ascii'ye katlanmış, tek boşluk).
// "Günaydın" gibi ifadeler buraya girmediğinde küçük modelde "Düşünüyorum"da
// asılıyordu — bu yüzden burada kapsanır.
function greetingAnswer(q) {
  if (/^(merhaba|selam|sa|slm|hello|hi|hey|hola)( nasilsin)?$/.test(q)) {
    return "Merhaba! Buradayım — nasıl yardımcı olabilirim?";
  }
  if (/^gun ?aydin$/.test(q)) return "Günaydın! Bugün sana nasıl yardımcı olabilirim?";
  if (/^iyi (gunler|sabahlar)$/.test(q)) return "İyi günler! Nasıl yardımcı olabilirim?";
  if (/^iyi (aksamlar|geceler)$/.test(q)) return "İyi akşamlar! Nasıl yardımcı olabilirim?";
  if (/^(nasilsin|naber|ne haber|nasil gidiyor)$/.test(q)) {
    return "İyiyim, teşekkürler! Sen nasılsın — ne üzerinde çalışalım?";
  }
  if (/^(tesekkurler|tesekkur ederim|tesekkur|sagol|sag ol|eyvallah|cok tesekkurler)$/.test(q)) {
    return "Rica ederim! Başka bir konuda yardımcı olayım mı?";
  }
  if (/^(gorusuruz|hosca kal|hoscakal|iyi calismalar|kendine iyi bak|iyi gunler dilerim)$/.test(q)) {
    return "Görüşürüz! İyi çalışmalar.";
  }
  return "";
}

function fastPathAnswer(input) {
  const q = normalize(input).replace(/[?.!]+$/g, "");
  const calc = calculatorAnswer(input);
  if (calc) return { hit: true, intent: "math.simple", answer: calc };

  const greet = greetingAnswer(q);
  if (greet) return { hit: true, intent: "chat.greeting", answer: greet };
  if (/^php\s+nedir$/.test(q)) {
    return { hit: true, intent: "knowledge.simple", answer: "PHP, özellikle web uygulamaları geliştirmek için kullanılan açık kaynaklı, sunucu taraflı bir programlama dilidir." };
  }
  if (/^renault\s+nedir$/.test(q)) {
    return { hit: true, intent: "knowledge.simple", answer: "Renault, Fransa merkezli bir otomobil üreticisidir; binek araçlar, ticari araçlar ve elektrikli modeller üretir." };
  }
  if (/^linux\s+nedir$/.test(q)) {
    return { hit: true, intent: "knowledge.simple", answer: "Linux, sunucularda, masaüstlerinde ve gömülü sistemlerde kullanılan açık kaynaklı bir işletim sistemi çekirdeğidir." };
  }
  if (/^api\s+nedir$/.test(q)) {
    return { hit: true, intent: "knowledge.simple", answer: "API, farklı yazılımların belirli kurallar üzerinden birbiriyle iletişim kurmasını sağlayan arayüzdür." };
  }
  return { hit: false, intent: "unknown", answer: "" };
}

module.exports = {
  normalize,
  fastPathAnswer,
  greetingAnswer,
};
