"use strict";

function foldTr(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function isPlaceholderAnswer(answer) {
  const value = foldTr(answer).replace(/^\s*final answer\s*:\s*/i, "").replace(/[.!?\s]+$/g, "").trim();
  return [
    "komut", "komutu", "sorgu", "sorguyu", "kod", "kodu",
    "cevap", "cevabi", "sonuc", "sonucu", "yanit", "kelime", "cumle"
  ].includes(value);
}

function deterministicCommandAnswer(question) {
  const q = foldTr(question);
  if (q.includes("ubuntu") && q.includes("disk") && (q.includes("kullanim") || q.includes("goster") || q.includes("yaz"))) return "df -h";
  if ((q.includes("mysql") || q.includes("mariadb")) && (q.includes("veritabani") || q.includes("database")) && (q.includes("liste") || q.includes("goster") || q.includes("show") || q.includes("yaz"))) return "SHOW DATABASES;";
  if (q.includes("docker") && (q.includes("container") || q.includes("calisan")) && (q.includes("liste") || q.includes("goster") || q.includes("yaz"))) return "docker ps";
  if (q.includes("users") && (q.includes("kayit") || q.includes("tum") || q.includes("select") || q.includes("liste"))) return "SELECT * FROM users;";
  return "";
}

function sanitizePlaceholderCommandAnswer(answer, question) {
  const fixed = deterministicCommandAnswer(question);
  if (fixed && isPlaceholderAnswer(answer)) return { changed: true, answer: fixed };
  return { changed: false, answer: String(answer || "") };
}

module.exports = { sanitizePlaceholderCommandAnswer, deterministicCommandAnswer, isPlaceholderAnswer };
