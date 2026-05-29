"use strict";
/**
 * agent/memory.js
 * ----------------
 * Basit, kalıcı yerel hafıza (JSON dosyası). "İnsan gibi hatırlama" için.
 *
 * Electron'a bağımlı DEĞİL (test edilebilirlik için): dosya yolu
 * `process.env.CODEGA_MEMORY_PATH` ile verilir; verilmezse kullanıcı ev
 * dizinine düşer. main.js başlangıçta app.getPath('userData') ile ayarlar.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function memoryPath() {
  if (process.env.CODEGA_MEMORY_PATH) return process.env.CODEGA_MEMORY_PATH;
  return path.join(os.homedir(), ".codega-ai", "memory.json");
}

function load() {
  try {
    const raw = fs.readFileSync(memoryPath(), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.facts) ? data : { facts: [] };
  } catch (_e) {
    return { facts: [] };
  }
}

function save(data) {
  const p = memoryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

/** Bir bilgiyi kalıcı belleğe ekle. */
function remember(fact) {
  const text = String(fact || "").trim();
  if (!text) return { ok: false, message: "boş bilgi" };
  const data = load();
  if (!data.facts.some((f) => f.text.toLowerCase() === text.toLowerCase())) {
    data.facts.push({ text, at: Date.now() });
    save(data);
  }
  return { ok: true, message: text };
}

/** Naive anahtar-kelime skoruyla bellekte ara. */
function recall(query, limit = 5) {
  const q = String(query || "").toLowerCase().trim();
  const data = load();
  if (!q) return data.facts.slice(-limit).map((f) => f.text);
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = data.facts
    .map((f) => {
      const t = f.text.toLowerCase();
      const score = terms.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0);
      return { text: f.text, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.text);
  return scored;
}

/** Tüm öğrenilen gerçekleri döndür (Ayarlar görüntüleyici için). */
function listFacts() {
  return load().facts.map((f) => f.text);
}

/** Belleği tamamen temizle. */
function clearAll() {
  save({ facts: [] });
  return true;
}

/**
 * Otonom öğrenme — kullanıcı mesajından KALICI kişisel gerçekleri çıkar.
 * Gürültüyü önlemek için yalnızca net kalıplar (ad, yaş, yaşadığı yer). Diğer her
 * şey için ajan zaten `remember` aracını kullanabilir.
 */
function extractDurableFacts(text) {
  const s = String(text || "").trim();
  const facts = [];
  let m;
  if ((m = s.match(/(?:benim\s+)?(?:ad[ıi]m|ismim)\s+([A-Za-zÇĞİıÖŞÜçğöşü]{2,})/i))) {
    facts.push(`Kullanıcının adı ${m[1]}`);
  }
  if ((m = s.match(/ben\s+(\d{1,2})\s+yaş[ıi]nday[ıi]m/i))) {
    facts.push(`Kullanıcı ${m[1]} yaşında`);
  }
  if ((m = s.match(/([A-Za-zÇĞİıÖŞÜçğöşü]{2,})['’]?(?:de|da|te|ta)\s+(?:yaş[ıi]yorum|oturuyorum)/i))) {
    facts.push(`Kullanıcı ${m[1]} şehrinde yaşıyor`);
  }
  return facts;
}

module.exports = { remember, recall, memoryPath, listFacts, clearAll, extractDurableFacts };
