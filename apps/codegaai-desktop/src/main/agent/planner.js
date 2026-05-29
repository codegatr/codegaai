"use strict";
/**
 * agent/planner.js
 * -----------------
 * Hedef-odaklı planlama: bir hedefi sıralı alt adımlara böler.
 *
 * Karmaşık bir istek geldiğinde, ajan önce kısa bir plan çıkarır (adımlar),
 * sonra bu planı rehber alarak çözer. Bu, "sadece komut değil, hedefe ulaşmak
 * için ara adımları oluşturma" yetisidir.
 *
 * parsePlan / looksLikeGoal / buildPlanMessages saf fonksiyonlar → test edilebilir.
 * makePlan, enjekte edilen generateFn ile modeli çağırır.
 */

const GOAL_HINTS = [
  "yap", "kur", "oluştur", "olustur", "hazırla", "hazirla", "geliştir", "gelistir",
  "planla", "analiz", "kurgula", "tasarla", "entegre", "migrate", "taşı", "tasi",
  "otomatikleştir", "araştır", "arastir", "raporla", "düzelt", "duzelt",
];

/** Mesaj çok adımlı bir hedef gibi mi görünüyor? */
function looksLikeGoal(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return false;
  if (t.length < 12) return false;
  const hasVerb = GOAL_HINTS.some((v) => t.includes(v));
  const multiClause = /(,| ve | sonra | önce | ardından | then )/.test(t);
  const longEnough = t.length > 80;
  return hasVerb && (multiClause || longEnough);
}

function buildPlanMessages(goal) {
  return [
    {
      role: "system",
      content:
        "Sen bir planlayıcısın. Verilen hedefi, uygulanabilir KISA adımlara bölersin. " +
        "Sadece numaralı adımları yaz (3-5 adım), açıklama ekleme.",
    },
    {
      role: "user",
      content: `Hedef: ${goal}\n\nBu hedefe ulaşmak için sıralı, kısa adımları numaralı liste olarak yaz.`,
    },
  ];
}

/** Model çıktısından numaralı/madde adımları çıkar. */
function parsePlan(text, max = 5) {
  const lines = String(text || "").split(/\r?\n/);
  const steps = [];
  for (const raw of lines) {
    const line = raw.trim();
    // "1." "1)" "- " "* " ile başlayan satırlar
    const m = line.match(/^(?:\d+[.)]|[-*])\s+(.*)$/);
    if (m && m[1].trim()) {
      steps.push(m[1].trim());
    }
  }
  return steps.slice(0, max);
}

/** Hedef için bir plan üret (generateFn(messages) -> string). */
async function makePlan(goal, generateFn, max = 5) {
  let out;
  try {
    out = (await generateFn(buildPlanMessages(goal))) || "";
  } catch (_e) {
    return [];
  }
  return parsePlan(out, max);
}

module.exports = { looksLikeGoal, buildPlanMessages, parsePlan, makePlan };
