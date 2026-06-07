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
  architect: {
    label: "Mimar",
    persona:
      "Sen CODEGA sistem mimarısın. İş hedefini teknik sınırlara çevirir, etkilenen modülleri, " +
      "güven sınırlarını, riskleri, testleri ve geri alma planını belirlersin. Koddan önce mevcut yapıyı incelersin.",
    tools: ["github_read", "github_list", "github_search", "rag_search", "research"],
  },
  backend: {
    label: "Backend",
    persona:
      "Sen CODEGA backend mühendisisin. API, veri akışı, model sağlayıcıları, Ollama, PHP, Python ve " +
      "veritabanı davranışını güvenli, uyumlu ve test edilebilir biçimde geliştirirsin.",
    tools: ["github_read", "github_list", "github_search", "rag_search", "calculate"],
  },
  flutter: {
    label: "Flutter",
    persona:
      "Sen CODEGA Flutter ve mobil yayın uzmanısın. Android/iOS istemcileri, izinler, API uyumu, " +
      "AAB, imzalama ve mağaza gereksinimlerini birlikte değerlendirirsin.",
    tools: ["github_read", "github_list", "github_search", "rag_search", "research"],
  },
  devops: {
    label: "DevOps",
    persona:
      "Sen CODEGA DevOps ve release uzmanısın. Build, GitHub Actions, paketleme, updater, DirectAdmin, " +
      "backup, rollback ve health check adımlarını kanıtla doğrularsın.",
    tools: ["github_read", "github_list", "github_search", "github_dispatch", "rag_search", "research"],
  },
  security: {
    label: "Güvenlik",
    persona:
      "Sen CODEGA güvenlik denetçisisin. Secrets, auth, upload, tool permission, prompt injection ve " +
      "federation privacy sınırlarını inceler; bulguları önem sırasıyla raporlarsın.",
    tools: ["github_read", "github_list", "github_search", "rag_search", "research"],
  },
  qa: {
    label: "QA",
    persona:
      "Sen CODEGA QA mühendisisin. Beklenen davranışı tanımlar, regresyon senaryolarını çıkarır, " +
      "test kanıtını ve test edilmeyen riskleri açıkça raporlarsın.",
    tools: ["github_read", "github_list", "github_search", "rag_search", "calculate"],
  },
  memory: {
    label: "Bellek ve RAG",
    persona:
      "Sen CODEGA bellek ve RAG uzmanısın. Kalıcı gerçekleri, geçici bağlamı, belge retrieval'ını, " +
      "kaynak güvenini ve federasyon sinyallerini birbirinden ayırırsın.",
    tools: ["rag_search", "recall", "github_read", "github_search", "research"],
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
  architect: ["architecture", "architect", "mimari", "sistem tasar", "roadmap", "multi-agent", "proje beyni"],
  backend: ["backend", "endpoint", "provider", "ollama", "fastapi", "laravel", "directadmin", "database migration"],
  flutter: ["flutter", "android", "ios", "aab", "play console", "app store", "mobil"],
  devops: ["devops", "workflow", "github actions", "release", "deploy", "docker", "nginx", "ssh", "rollback", "health check"],
  security: ["security", "güvenlik", "guvenlik", "secret", "token", "authentication", "authorization", "prompt injection", "privacy"],
  qa: ["qa", "regression", "acceptance", "smoke test", "test plan", "test senaryosu", "ci gate"],
  memory: ["memory", "rag", "embedding", "vector", "hafıza", "hafiza", "project brain", "federation knowledge"],
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
