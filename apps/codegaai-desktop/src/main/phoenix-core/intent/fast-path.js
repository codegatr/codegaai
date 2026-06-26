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

function fastPathAnswer(input) {
  const q = normalize(input).replace(/[?.!]+$/g, "");
  const calc = calculatorAnswer(input);
  if (calc) return { hit: true, intent: "math.simple", answer: calc };

  if (/^(merhaba|selam|sa|hello|hi|hey)$/.test(q) || /^merhaba\s+nasilsin$/.test(q)) {
    return { hit: true, intent: "chat.greeting", answer: "Merhaba. Buradayım, nasıl yardımcı olayım?" };
  }
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
};
