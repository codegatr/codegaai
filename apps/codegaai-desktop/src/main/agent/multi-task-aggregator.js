"use strict";

function norm(text) {
  return String(text || "").toLowerCase()
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c");
}

function commandAnswer(block) {
  const q = norm(block);
  if (q.includes("ubuntu") && q.includes("disk")) return "df -h";
  if ((q.includes("mysql") || q.includes("mariadb")) && (q.includes("veritabani") || q.includes("database"))) return "SHOW DATABASES;";
  if (q.includes("docker") && (q.includes("container") || q.includes("calisan"))) return "docker ps";
  return "";
}

function mathAnswer(block) {
  const q = norm(block);
  const m = q.match(/(-?\d+)\s*([+\-*x])\s*(-?\d+)/);
  if (!m || !(q.includes("kac") || q.includes("sonuc") || q.includes("sadece") || q.includes("?"))) return "";
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  if (m[2] === "+") return String(a + b);
  if (m[2] === "-") return String(a - b);
  return String(a * b);
}

function literalAnswer(block) {
  const m = String(block || "").match(/sadece\s+([^\r\n.]{1,40})\s+yaz/i);
  return m ? String(m[1]).trim() : "";
}

function smallAnswer(block) {
  const q = norm(block);
  return mathAnswer(block) || commandAnswer(block) ||
    (/php\s+(nedir|ne demek)/.test(q) ? "PHP, sunucu tarafinda calisan web programlama dilidir." : "") ||
    (/laravel\s+(nedir|ne demek)/.test(q) ? "Modern PHP web frameworkudur." : "") ||
    (q.includes("turkiye") && q.includes("baskent") ? "Ankara" : "") ||
    literalAnswer(block);
}

function splitBlocks(text) {
  const blocks = [];
  let cur = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (cur.length) blocks.push(cur.join("\n").trim());
      cur = [];
    } else cur.push(line.trim());
  }
  if (cur.length) blocks.push(cur.join("\n").trim());
  return blocks;
}

function multiTaskAnswer(question) {
  const blocks = splitBlocks(question);
  if (blocks.length < 2) return "";
  const answers = blocks.map(smallAnswer);
  if (answers.some((x) => !x)) return "";
  return answers.join("\n\n");
}

function maybeReplacePartialAnswer(answer, question) {
  const full = multiTaskAnswer(question);
  if (!full) return { changed: false, answer: String(answer || "") };
  const current = String(answer || "").trim();
  const first = full.split(/\n\n/)[0].trim();
  if (!current || current === first || current.toLowerCase() === "komutu") return { changed: true, answer: full };
  return { changed: false, answer: current };
}

module.exports = { multiTaskAnswer, maybeReplacePartialAnswer };
