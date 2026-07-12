"use strict";

/**
 * anti-loop.js — Yerel modelin "asla bitirmeyen" tekrar/döngü çöpünü temizler.
 *
 * Küçük modeller (örn. ~4B) muhakeme sorularında aynı cümleyi/paragrafı 3-5 kez
 * arka arkaya yazıp çöpe dönüşebiliyor. Bu modül üretilmiş metni SON İŞLEM olarak
 * süzer: uzun cümlelerin tekrarını (global) ve ardışık kısa tekrarları kaldırır.
 * Kod blokları (```...```) DOKUNULMADAN korunur. Saf + test edilebilir.
 */

function foldTr(s) {
  return String(s || "")
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u");
}

// Karşılaştırma için normalize: harf-küçült, TR-katla, alfasayısal-dışını boşluğa indir.
function norm(s) {
  return foldTr(String(s || "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const MIN_DEDUP_LEN = 40; // bu uzunluğun altındaki normalize cümleler global dedup'a girmez

// KOD SATIRI SEZİCİ: fence'siz/kapanmamış-fence'li kodda meşru "tekrar" olağandır
// (iki tabloda aynı created_at kolonu, iki class'ta aynı satır). Bu satırlar
// dedup'a SOKULMAZ — aksi halde geçerli SQL/PHP satırları sessizce silinir
// (alpha.100 output-corruption regresyonunun kök nedeni).
function looksLikeCodeLine(p) {
  const s = String(p || "");
  if (/^\s{2,}\S/.test(s)) return true;                  // girintili satır
  if (/[;{}]\s*$/.test(s)) return true;                   // ; { } ile biter
  if (/,\s*$/.test(s) && /[()=`'"]|\b[A-Z]{2,}\b/.test(s)) return true; // kolon/parametre satırı
  if (/^\s*(--|\/\/|#|\*)/.test(s)) return true;        // yorum satırı
  if (/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|SET|USE|GRANT|FOREIGN|PRIMARY|INDEX|CONSTRAINT|ENGINE|DECLARE|RETURN|FUNCTION|CLASS|PUBLIC|PRIVATE|NAMESPACE|IMPORT|FROM|DEF|CONST|LET|VAR)\b/i.test(s)) return true;
  return false;
}

// Bir prose parçasında tekrarı çöker.
function collapseProse(seg) {
  // Cümle/satır parçalarına ayır; ayraçları (boşluk/yenisatır) yakala ki biçim korunsun.
  const pieces = seg.split(/(\n+|(?<=[.!?])\s+)/);
  const seen = new Set();
  let prevNorm = "";
  let out = "";
  for (const p of pieces) {
    if (p === "" || /^\s+$/.test(p)) { out += p; continue; } // saf ayraç
    const n = norm(p);
    if (!n) { out += p; continue; }
    if (looksLikeCodeLine(p)) { prevNorm = n; out += p; continue; } // kod satırı → dedup YOK
    if (n.length >= MIN_DEDUP_LEN) {
      if (seen.has(n)) continue;      // uzun cümle daha önce geçti → at (global)
      seen.add(n);
    } else if (n === prevNorm) {
      continue;                        // kısa cümle bir öncekiyle aynı → at (ardışık)
    }
    prevNorm = n;
    out += p;
  }
  return out.replace(/\n{3,}/g, "\n\n");
}

// Run-on "cümle" tekrarını yakala: nokta olmadan aynı uzun ifade tekrar tekrar
// yazılırsa (küçük model çöpü), İLK tekrarın başladığı yerden itibaren keser.
// Kelime n-gram (varsayılan 12) normalize edilip daha önce görüldüyse kırpılır.
const PHRASE_NGRAM = 12;
function truncateAtPhraseLoop(seg, ngram = PHRASE_NGRAM) {
  const toks = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(seg))) toks.push({ w: m[0], idx: m.index });
  if (toks.length < ngram * 2) return seg;
  const normed = toks.map((t) => norm(t.w));
  const seen = new Set();
  for (let i = 0; i + ngram <= normed.length; i++) {
    const gram = normed.slice(i, i + ngram).join(" ");
    if (gram.replace(/\s/g, "").length < 30) continue; // çok kısa n-gram → atla
    if (seen.has(gram)) {
      // i. kelimeden itibaren tekrar başlıyor → orijinal biçimi koruyarak oraya kadar kes.
      const kept = seg.slice(0, toks[i].idx).trim();
      return kept || seg;
    }
    seen.add(gram);
  }
  return seg;
}

/**
 * Tekrar/döngü temizliği. Kod bloklarını korur.
 * @param {string} text
 * @returns {string}
 */
// SEGMENT düzeyi kod sezici: fence'siz gövdenin ağırlıklı olarak koddan
// oluşup oluşmadığını ölçer. Kod segmentinde meşru desen tekrarı olağandır
// (iki tabloda aynı kolonlar) — dedup VE phrase-loop kesici devre dışı kalır.
function looksLikeCodeSegment(seg) {
  const lines = String(seg || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 3) return false;
  const codey = lines.filter((l) => looksLikeCodeLine(l)).length;
  return codey >= 2 && codey / lines.length >= 0.4;
}

function collapseRepetition(text) {
  const src = String(text || "");
  if (!src.trim()) return src;
  // ```...``` bloklarını böl; kod segmentlerine dokunma.
  const parts = src.split(/(```[\s\S]*?```)/g);
  return parts.map((seg) => {
    if (seg.startsWith("```")) return seg; // kapalı kod bloğu → dokunma
    // KAPANMAMIŞ fence koruması: parçada açılan ama kapanmayan fence varsa
    // (üretim yarıda kesildi / model kapatmadı), fence sonrası KOD kabul edilir
    // ve dokunulmaz — yalnız öncesindeki düz metin süzülür.
    const open = seg.indexOf("```");
    if (open >= 0) {
      const prose = seg.slice(0, open);
      return (looksLikeCodeSegment(prose) ? prose : truncateAtPhraseLoop(collapseProse(prose))) + seg.slice(open);
    }
    // Fence'siz ama kod ağırlıklı segment (model fence koymayı unuttu) → dokunma.
    if (looksLikeCodeSegment(seg)) return seg;
    return truncateAtPhraseLoop(collapseProse(seg));
  }).join("").trim();
}

/**
 * Metin "kaçak tekrar" içeriyor mu? (uzun bir cümle 3+ kez) — teşhis/telemetri için.
 * @param {string} text
 * @returns {boolean}
 */
function detectRunawayRepetition(text) {
  const counts = new Map();
  const proseSegments = String(text || "").split(/```[\s\S]*?```/g);
  for (const segment of proseSegments) {
    for (const raw of segment.split(/\n+|(?<=[.!?])\s+/)) {
      const n = norm(raw);
      if (n.length < MIN_DEDUP_LEN) continue;
      const c = (counts.get(n) || 0) + 1;
      counts.set(n, c);
      if (c >= 3) return true;
    }
  }
  return false;
}

module.exports = { collapseRepetition, detectRunawayRepetition, truncateAtPhraseLoop, norm };
