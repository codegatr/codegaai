"use strict";

/**
 * mission-types.js — CODEGA AI MissionOS Veri Tipleri ve Fabrika Fonksiyonları
 *
 * Sprint 10: MissionOS
 * "İnteraksiyon modeli artık prompt-driven değil, mission-driven."
 *
 * Hiyerarşi: Mission → Milestone → Task → SubTask → Patch → Release
 */

// ── Durum Sabitleri ───────────────────────────────────────────────────────────

const MISSION_STATES = Object.freeze({
  PLANNING:    "planning",
  SCHEDULED:   "scheduled",
  ACTIVE:      "active",
  REVIEW:      "review",
  COMPLETED:   "completed",
  RELEASED:    "released",
  FAILED:      "failed",
  ROLLED_BACK: "rolled_back",
  CANCELLED:   "cancelled",
});

const TASK_STATES = Object.freeze({
  PENDING:   "pending",
  QUEUED:    "queued",
  ACTIVE:    "active",
  COMPLETED: "completed",
  FAILED:    "failed",
  SKIPPED:   "skipped",
  BLOCKED:   "blocked",
});

const MILESTONE_STATES = Object.freeze({
  PENDING:   "pending",
  ACTIVE:    "active",
  COMPLETED: "completed",
  FAILED:    "failed",
});

const PRIORITY = Object.freeze({
  CRITICAL: "critical",
  HIGH:     "high",
  MEDIUM:   "medium",
  LOW:      "low",
});

const SPRINT_TYPE = Object.freeze({
  FOUNDATION:  "foundation",  // altyapı, mimari, güvenlik, performans, kalite
  CAPABILITY:  "capability",  // kullanıcıya görünür yeni yetenekler
});

const DNA_VERDICT = Object.freeze({
  SUCCESSFUL: "SUCCESSFUL",
  MARGINAL:   "MARGINAL",
  FAILED:     "FAILED",   // Q5 'EVET' ise → sprint başarısız
});

/** Tüm tanımlı ajan rolleri (Agent Scheduler tarafından kullanılır) */
const AGENT_ROSTER = Object.freeze([
  "planner", "architect", "builder", "backend", "frontend",
  "database", "qa", "security", "performance", "documentation",
  "git", "release",
]);

// ── Fabrika Fonksiyonları ─────────────────────────────────────────────────────

function _uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Yeni bir Mission nesnesi oluşturur (ID, timestamps, state otomatik).
 */
function createMission({
  title            = "Unnamed Mission",
  description      = "",
  priority         = PRIORITY.MEDIUM,
  riskScore        = 5,
  estimatedMinutes = 60,
  estimatedTokens  = 10000,
  requiredAgents   = [],
  dependencies     = [],   // misyon ID listesi
  rollbackPlan     = "",
  milestones       = [],
  sprintType       = SPRINT_TYPE.CAPABILITY,
} = {}) {
  const now = Date.now();
  return {
    id:               _uid("mission"),
    title,
    description,
    priority,
    riskScore:        Math.max(0, Math.min(10, Number(riskScore) || 5)),
    estimatedMinutes: Number(estimatedMinutes) || 60,
    estimatedTokens:  Number(estimatedTokens)  || 10000,
    requiredAgents:   [...requiredAgents],
    dependencies:     [...dependencies],
    state:            MISSION_STATES.PLANNING,
    completionPercent: 0,
    rollbackPlan,
    sprintType,
    milestones:       milestones.map(ms => createMilestone(ms)),
    dna:              null,     // CODEGA DNA — release sonrası doldurulur
    selfReview:       null,     // SelfReview — completion'da doldurulur
    createdAt:        now,
    startedAt:        null,
    completedAt:      null,
    releasedAt:       null,
    releases:         [],       // versiyon tag'leri ["6.0.0-alpha.24", ...]
    executionLog:     [],       // { ts, level, msg } olayları
  };
}

/**
 * Yeni bir Milestone nesnesi oluşturur.
 */
function createMilestone({
  title  = "Unnamed Milestone",
  tasks  = [],
} = {}) {
  return {
    id:          _uid("ms"),
    title,
    state:       MILESTONE_STATES.PENDING,
    tasks:       tasks.map(t => createTask(t)),
    completedAt: null,
  };
}

/**
 * Yeni bir Task nesnesi oluşturur.
 */
function createTask({
  title        = "Unnamed Task",
  description  = "",
  agent        = "builder",
  dependencies = [],   // task ID listesi (aynı misyon içinde)
  subtasks     = [],
} = {}) {
  return {
    id:           _uid("task"),
    title,
    description,
    agent,
    state:        TASK_STATES.PENDING,
    dependencies: [...dependencies],
    subtasks:     subtasks.map(st => createSubTask(st)),
    result:       null,
    error:        null,
    startedAt:    null,
    completedAt:  null,
    durationMs:   null,
  };
}

/**
 * Yeni bir SubTask nesnesi oluşturur.
 */
function createSubTask({
  title = "Unnamed SubTask",
  agent = "builder",
} = {}) {
  return {
    id:          _uid("subtask"),
    title,
    agent,
    state:       TASK_STATES.PENDING,
    result:      null,
    completedAt: null,
  };
}

/**
 * SelfReview şeması — her feature/sprint için 8-boyutlu değerlendirme.
 * Her boyut 1-10 arası puan.
 */
function createSelfReview({
  architecture         = 0,
  performance          = 0,
  security             = 0,
  complexity           = 0,
  maintainability      = 0,
  scalability          = 0,
  regressionRisk       = 0,  // düşük = iyi (inverted)
  builderMemoryCompat  = 0,
  notes                = "",
} = {}) {
  const raw = {
    architecture, performance, security, complexity,
    maintainability, scalability, regressionRisk, builderMemoryCompat,
  };
  const avg = Object.values(raw).reduce((s, v) => s + v, 0) / Object.keys(raw).length;
  return {
    scores:      raw,
    average:     Math.round(avg * 10) / 10,
    notes,
    evaluatedAt: Date.now(),
  };
}

// ── Yardımcı Hesaplamalar ────────────────────────────────────────────────────

/**
 * Bir mission'ın tamamlanma yüzdesini hesaplar.
 * Tüm task'ların state'ine göre ağırlıklı ortalama.
 */
function calcCompletionPercent(mission) {
  const allTasks = mission.milestones.flatMap(ms => ms.tasks);
  if (!allTasks.length) return 0;
  const done = allTasks.filter(t =>
    t.state === TASK_STATES.COMPLETED || t.state === TASK_STATES.SKIPPED
  ).length;
  return Math.round((done / allTasks.length) * 100);
}

/**
 * Mission'daki tüm task ID'lerini flat liste olarak döner.
 */
function allTaskIds(mission) {
  return mission.milestones.flatMap(ms => ms.tasks.map(t => t.id));
}

/**
 * Task ID'ye göre task + milestone bul.
 */
function findTask(mission, taskId) {
  for (const ms of mission.milestones) {
    for (const t of ms.tasks) {
      if (t.id === taskId) return { milestone: ms, task: t };
    }
  }
  return null;
}

module.exports = {
  MISSION_STATES,
  TASK_STATES,
  MILESTONE_STATES,
  PRIORITY,
  SPRINT_TYPE,
  DNA_VERDICT,
  AGENT_ROSTER,
  createMission,
  createMilestone,
  createTask,
  createSubTask,
  createSelfReview,
  calcCompletionPercent,
  allTaskIds,
  findTask,
};
