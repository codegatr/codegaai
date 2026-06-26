"use strict";

function normalizeTaskText(value) {
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

function classifyIntent(input) {
  const text = normalizeTaskText(input);
  if (/(servis|fiat|erp|crm|otomasyon|proje|sistem).*(gelistir|olustur|yap|kur|hazirla|uret|kodla)/.test(text)) return "project";
  if (/(release|surum|sürüm|tag|github|push|guncelleme).*(olustur|hazirla|gonder|yayimla|yayınla)/.test(text)) return "release";
  if (/(model|ollama).*(kur|indir|hazirla|guncelle)/.test(text)) return "provisioning";
  if (/(ac|aç|kapat|calistir|çalıştır|dosya|klasor|klasör|terminal)/.test(text)) return "desktop";
  if (/(php|python|javascript|typescript|sql|api|kod|fonksiyon|class|controller|migration)/.test(text)) return "code";
  return "chat";
}

function estimateComplexity(input, intent) {
  const text = normalizeTaskText(input);
  let score = 1;
  if (text.length > 120) score += 1;
  if (text.length > 300) score += 1;
  if (/(veritabani|database|frontend|backend|docker|test|api|admin|panel|sms|netgsm|fatura|stok)/.test(text)) score += 2;
  if (/(erp|otomasyon|sistem|proje)/.test(text)) score += 2;
  if (intent === "project") score += 2;
  if (intent === "release") score += 1;
  return Math.max(1, Math.min(10, score));
}

function agentsForIntent(intent, complexity) {
  if (intent === "project") return ["planner", "database", "backend", "security", "reviewer", "builder"];
  if (intent === "code") return complexity >= 5 ? ["coder", "security", "reviewer"] : ["coder"];
  if (intent === "release") return ["release", "reviewer"];
  if (intent === "provisioning") return ["provisioning"];
  if (intent === "desktop") return ["desktop"];
  return ["chat"];
}

function createTask(input, options = {}) {
  const intent = options.intent || classifyIntent(input);
  const complexity = estimateComplexity(input, intent);
  const agents = options.agents || agentsForIntent(intent, complexity);
  return {
    id: `task-${Date.now().toString(36)}`,
    input: String(input || "").trim(),
    intent,
    complexity,
    priority: complexity >= 7 ? "high" : complexity >= 4 ? "normal" : "low",
    agents,
    createdAt: new Date().toISOString(),
    status: "planned",
  };
}

module.exports = {
  normalizeTaskText,
  classifyIntent,
  estimateComplexity,
  agentsForIntent,
  createTask,
};
