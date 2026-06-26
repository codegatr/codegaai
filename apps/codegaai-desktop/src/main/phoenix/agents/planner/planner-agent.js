"use strict";

function projectPlanFor(task) {
  const input = String(task.input || "");
  const isService = /fiat|servis|otomasyon|iş emri|is emri/i.test(input);
  if (isService) {
    return [
      { id: "TASK-001", title: "Gereksinim Analizi", agent: "planner", status: "pending" },
      { id: "TASK-002", title: "Veritabanı Şeması", agent: "database", status: "pending" },
      { id: "TASK-003", title: "Kimlik Doğrulama ve Yetki", agent: "backend", status: "pending" },
      { id: "TASK-004", title: "Müşteri ve Araç Modülleri", agent: "backend", status: "pending" },
      { id: "TASK-005", title: "İş Emri ve Servis Süreci", agent: "backend", status: "pending" },
      { id: "TASK-006", title: "Stok, Parça ve Fatura", agent: "backend", status: "pending" },
      { id: "TASK-007", title: "NETGSM / E-posta Bildirimleri", agent: "integration", status: "pending" },
      { id: "TASK-008", title: "Güvenlik İncelemesi", agent: "security", status: "pending" },
      { id: "TASK-009", title: "README ve Kurulum", agent: "reviewer", status: "pending" },
      { id: "TASK-010", title: "Proje Paketleme", agent: "builder", status: "pending" },
    ];
  }
  return [
    { id: "TASK-001", title: "İstek Analizi", agent: "planner", status: "pending" },
    { id: "TASK-002", title: "Uygulama Tasarımı", agent: "coder", status: "pending" },
    { id: "TASK-003", title: "Güvenlik ve Kalite Kontrol", agent: "reviewer", status: "pending" },
  ];
}

function planTask(task) {
  const subtasks = task.intent === "project" ? projectPlanFor(task) : projectPlanFor(task).slice(0, 3);
  return {
    taskId: task.id,
    intent: task.intent,
    complexity: task.complexity,
    estimatedSteps: subtasks.length,
    subtasks,
    summary: `${subtasks.length} alt görev planlandı.`,
  };
}

function renderPlan(plan) {
  return [
    "Phoenix Task Engine planı:",
    "",
    `Amaç: ${plan.intent}`,
    `Karmaşıklık: ${plan.complexity}/10`,
    `Alt görev: ${plan.estimatedSteps}`,
    "",
    ...plan.subtasks.map((task) => `- ${task.id} — ${task.title} (${task.agent})`),
  ].join("\n");
}

module.exports = {
  planTask,
  renderPlan,
};
