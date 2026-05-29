"use strict";
/**
 * agent/agents.js
 * ----------------
 * Uzman ajan tanımları (multi-agent mimarisi için).
 *
 * Her uzmanın bir personası (system prompt) ve izinli araç seti (tool policy)
 * vardır. Orchestrator bir alt görevi uygun uzmana yönlendirir.
 *
 * routeStep / buildSpecialistPrompt saf fonksiyonlar → modelsiz test edilebilir.
 */

const SPECIALISTS = {
  researcher: {
    label: "Araştırmacı",
    persona:
      "Sen bir araştırma uzmanısın. Görevin: güvenilir bilgi toplamak ve özetlemek. " +
      "Dünya bilgisi gerektiğinde mutlaka araç kullan, asla uydurma. Bulgularını kısa ve kaynaklı ver.",
    tools: ["web_search", "research", "read_url", "rag_search"],
  },
  coder: {
    label: "Yazılımcı",
    persona:
      "Sen bir yazılım uzmanısın (PHP 8.3, JS, DevOps). Görevin: net, çalışır kod ve teknik çözüm üretmek. " +
      "Gerekirse repo/kod incele. Kodun kısa açıklamasını da ekle.",
    tools: ["github_read", "github_list", "github_search", "calculate", "rag_search"],
  },
  reviewer: {
    label: "Denetçi",
    persona:
      "Sen bir denetçi/gözden geçirme uzmanısın. Görevin: verilen çıktıyı doğruluk, eksiklik ve " +
      "güvenlik açısından kontrol etmek; sorun varsa düzeltmek. Uydurma bilgi ararsın.",
    tools: ["rag_search"],
  },
  generalist: {
    label: "Genel",
    persona:
      "Sen genel amaçlı bir asistansın. Görevi en uygun şekilde, dürüst ve net biçimde çöz.",
    tools: ["web_search", "research", "read_url", "rag_search", "calculate", "current_time", "weather"],
  },
};

const ROUTE_HINTS = {
  coder: ["kod", "php", "javascript", "script", "repo", "github", "fonksiyon", "bug", "hata ayıkla", "derle", "api", "sql", "veritabanı", "deploy"],
  researcher: ["araştır", "arastir", "bul", "incele", "kaynak", "haber", "fiyat", "nedir", "kim", "karşılaştır", "karsilastir", "öğren", "ogren"],
  reviewer: ["kontrol", "denetle", "gözden geçir", "gozden gecir", "doğrula", "dogrula", "test et", "güvenlik", "guvenlik", "review"],
};

/** Bir alt görevi en uygun uzmana yönlendir (anahtar kelime tabanlı). */
function routeStep(stepText) {
  const t = String(stepText || "").toLowerCase();
  let best = "generalist";
  let bestScore = 0;
  for (const [key, hints] of Object.entries(ROUTE_HINTS)) {
    const score = hints.reduce((s, h) => s + (t.includes(h) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

function buildSpecialistPrompt(specialistKey, baseTask = "") {
  const spec = SPECIALISTS[specialistKey] || SPECIALISTS.generalist;
  const toolList = spec.tools.map((t) => `- ${t}`).join("\n");
  return [
    spec.persona,
    "",
    "Kullanabileceğin araçlar (yalnızca bunlar):",
    toolList,
    'Araç formatı: <tool>arac_adi("argüman")</tool>',
    "Emin olmadığın bilgiyi uydurma; gerekiyorsa araç kullan ya da 'emin değilim' de.",
    baseTask ? `\nGörev bağlamı: ${baseTask}` : "",
  ].join("\n");
}

module.exports = { SPECIALISTS, routeStep, buildSpecialistPrompt };
