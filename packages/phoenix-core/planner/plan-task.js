"use strict";

const MODULES = {
  service_automation: ["auth", "customers", "vehicles", "work_orders", "parts_stock", "appointments", "invoices", "payments", "sms", "mail", "reports", "settings"],
  erp: ["auth", "customers", "products", "stock", "orders", "invoices", "payments", "cash", "reports", "settings"],
  authentication: ["database", "register", "login", "session", "logout", "middleware", "csrf", "readme"],
  web_platform: ["public", "admin", "content", "seo", "forms", "mail", "settings"],
  general: ["analysis", "implementation", "review"],
};

function estimateFiles(task, modules) {
  if (!task.needsFiles) return 0;
  if (task.domain === "authentication") return 8;
  return Math.max(12, modules.length * 7);
}

function planTask(task) {
  const modules = MODULES[task.domain] || MODULES.general;
  const steps = [];

  steps.push({ id: "requirements", agent: "planner", title: "Gereksinimleri ve kabul kriterlerini çıkar" });
  steps.push({ id: "architecture", agent: "analyst", title: "Mimari ve veri modelini tasarla" });

  for (const moduleName of modules) {
    steps.push({ id: `module:${moduleName}`, agent: "coder", title: `${moduleName} modülünü üret` });
  }

  if (task.needsReview) {
    steps.push({ id: "security-review", agent: "security", title: "Güvenlik kontrolü yap" });
    steps.push({ id: "code-review", agent: "reviewer", title: "Kod kalite incelemesi yap" });
  }

  steps.push({ id: "delivery", agent: "project-builder", title: "Teslim planını ve dosya listesini hazırla" });

  return {
    taskId: task.id,
    modules,
    steps,
    estimatedFiles: estimateFiles(task, modules),
    estimatedModules: modules.length,
    mode: task.needsFiles ? "project_build" : "answer",
  };
}

module.exports = {
  planTask,
};
