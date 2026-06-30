"use strict";

/**
 * prompt-splitter.js
 * ------------------
 * Çok-soruluk (5+) yük testlerinde küçük yerel modeller devasa tek prompt'u
 * işleyemeyip dejenere olabiliyor (örn. tüm cevap yerine tek "0.75"). Bu modül
 * böyle bir girdiyi SORU bazında güvenle parçalara ayırır; model-manager bunları
 * ARDIŞIK (sequential) gönderip akışları tek yanıtta birleştirir.
 *
 * Tasarım kuralları (defensive):
 *  - Yalnız AÇIK soru işaretçileri başlık sayılır: "1.", "1)", "1-", "[Etiket]",
 *    "Soru/Test/Görev/Question/Problem N". Düz \n ile BÖLMEZ (yanlış parçalanma).
 *  - Çok-soru sayılması için ≥5 segment VE segmentlerin yarıdan çoğunda "?" şart
 *    (numaralı yapılacaklar listesi / kod bloğu yanlışlıkla bölünmesin).
 *  - Hiçbir koşul tutmazsa null döner → çağıran normal tek-prompt akışına devam eder.
 */

const HEADER_RE = /^\s*(?:\d+[.)\-]\s+|\[[^\]\n]{2,40}\]\s*|(?:soru|test|görev|gorev|question|problem)\s*\d+\b)/i;

/**
 * Metni soru segmentlerine ayırır. Başlık satırından bir sonraki başlığa kadarki
 * her şey o sorunun gövdesidir. İlk başlıktan önceki ön-metin (örn. "Sorular:")
 * segmentlere dahil edilmez.
 * @returns {string[]}
 */
function splitQuestions(text) {
  const lines = String(text || "").split(/\r?\n/);
  const segments = [];
  let current = null;
  for (const line of lines) {
    if (HEADER_RE.test(line)) {
      if (current !== null) segments.push(current);
      current = line;
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  if (current !== null) segments.push(current);
  return segments.map((s) => s.trim()).filter(Boolean);
}

/**
 * Girdi çok-soruluk bir yük testi mi? Değilse null.
 * @param {string} text
 * @param {{ chunkSize?: number, minQuestions?: number }} opts
 * @returns {{ chunks: Array<{label:string,text:string,count:number}>, questionCount:number } | null}
 */
function chunkQuestions(text, opts = {}) {
  const chunkSize = Number.isFinite(opts.chunkSize) && opts.chunkSize > 0 ? Math.floor(opts.chunkSize) : 4;
  const minQuestions = Number.isFinite(opts.minQuestions) && opts.minQuestions > 0 ? Math.floor(opts.minQuestions) : 5;

  const questions = splitQuestions(text);
  if (questions.length < minQuestions) return null;

  // Soru doğası kontrolü: segmentlerin en az yarısı "?" içermeli.
  const withQuestionMark = questions.filter((q) => q.includes("?")).length;
  if (withQuestionMark < Math.ceil(questions.length / 2)) return null;

  const chunks = [];
  for (let i = 0; i < questions.length; i += chunkSize) {
    const group = questions.slice(i, i + chunkSize);
    const startNo = i + 1;
    const endNo = i + group.length;
    const body =
      "Aşağıdaki soruları sırayla, her birini ayrı başlık altında ve eksiksiz yanıtla. " +
      "Hiçbirini atlama, yalnız tek bir sayı/kesir ile geçiştirme:\n\n" +
      group.join("\n\n");
    chunks.push({ label: `Sorular ${startNo}–${endNo}`, text: body, count: group.length });
  }
  return { chunks, questionCount: questions.length };
}

module.exports = { splitQuestions, chunkQuestions, HEADER_RE };
