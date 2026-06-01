"use strict";
/**
 * agent/reflect.js
 * -----------------
 * Öz değerlendirme (self-reflection) katmanı.
 *
 * Denetçi raporu ASLA kullanıcıya sızmamalı. Küçük modeller "OK" yerine etiketli
 * rapor üretebilir; temiz cevabı ayıklarız, ayıklayamazsak TASLAĞA döneriz.
 *
 * Türkçe NOT: tespit, Türkçe-güvenli küçük harfe (toLocaleLowerCase('tr')) çevrilen
 * metin üzerinde yapılır; aksi halde "İ" (U+0130) /i bayrağıyla eşleşmez.
 *
 * looksOk / buildCritiqueMessages / sanitizeRevision saf → modelsiz test edilebilir.
 */

function tlow(s) {
  return String(s || "").toLocaleLowerCase("tr");
}

const OK_PATTERN = /^\s*(ok|tamam|doğru|aynen|sorun\s*yok)\b/;
const CONTROL_ONLY_PATTERN = /^\s*(sadece\s+)?(ok|tamam|doğru|aynen|sorun\s*yok)[.!?\s]*$/;
const REPORT_LINE = /^\s*(uydu|eksiklik|sorun|durum|değerlendirme|verdict|revised|none\s*detected)\s*[:\-]/;
const LEAK_MARKERS = /(düzeltilmi[şs]\s*cevap|uydu\s*[:\-]|eksiklik\s*[:\-]|sorun\s*[:\-]|durum\s*[:\-]|değerlendirme\s*[:\-]|none\s*detected|verdict|revised)/;
const DUZ_MARKER = /d[üu]zeltilmi[şs]\s*cevap\s*[:\-]?\s*/;

function looksOk(text) {
  const t = tlow(text).trim();
  return OK_PATTERN.test(t) || CONTROL_ONLY_PATTERN.test(t);
}

function buildCritiqueMessages(question, draftAnswer) {
  return [
    {
      role: "system",
      content:
        "Sen bir denetçisin. Bir cevabı doğruluk/eksiklik/uydurma açısından kontrol edip İYİLEŞTİRİRSİN.\n" +
        "ÇIKTI KURALI (kesin): Cevap iyiyse SADECE 'AYNEN' yaz. Düzeltme gerekiyorsa SADECE " +
        "düzeltilmiş cevabı yaz. ASLA etiket/başlık yazma: 'DÜZELTİLMİŞ CEVAP', 'Uydu', " +
        "'Eksiklik', 'Sorun', 'Değerlendirme', açıklama vb. YASAK. Sadece nihai cevap metni.",
    },
    {
      role: "user",
      content: `Soru: ${question}\n\nMevcut cevap:\n${draftAnswer}\n\nKurala uy: ya 'AYNEN' ya da yalnızca düzeltilmiş cevap.`,
    },
  ];
}

/** Denetçi çıktısını temizle: temiz cevabı çıkar, çıkaramazsan taslağı koru. */
function sanitizeRevision(verdict, draft) {
  const orig = String(verdict || "").trim();
  if (!orig) return { revised: false, answer: draft };
  const low = tlow(orig);
  if (OK_PATTERN.test(low) || CONTROL_ONLY_PATTERN.test(low)) return { revised: false, answer: draft };

  // "Düzeltilmiş cevap:" etiketinden sonrasını al (indeks orijinalle hizalı)
  let start = 0;
  const mm = low.match(DUZ_MARKER);
  if (mm && typeof mm.index === "number") start = mm.index + mm[0].length;

  const lines = orig.slice(start).split(/\r?\n/);
  const lowLines = low.slice(start).split(/\r?\n/);
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (REPORT_LINE.test(lowLines[i])) break; // rapor satırına gelince kes
    kept.push(lines[i]);
  }
  const t = kept.join("\n").trim();

  // Hâlâ etiket sızıntısı varsa ya da boşsa: TASLAĞA dön (rapor asla gösterilmez)
  if (!t || LEAK_MARKERS.test(tlow(t))) return { revised: false, answer: draft };
  return { revised: true, answer: t };
}

async function reflect(question, draftAnswer, generateFn) {
  const draft = String(draftAnswer || "").trim();
  if (!draft) return { revised: false, answer: draft };
  let out;
  try {
    out = (await generateFn(buildCritiqueMessages(question, draft))) || "";
  } catch (_e) {
    return { revised: false, answer: draft };
  }
  return sanitizeRevision(out, draft);
}

module.exports = { reflect, looksOk, buildCritiqueMessages, sanitizeRevision };
