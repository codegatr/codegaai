"use strict";

/**
 * mission-scheduler.js — CODEGA AI Mission Zamanlayıcı
 *
 * Sprint 10: MissionOS
 *
 * Sorumluluklar:
 *  1. Görev bağımlılıklarını topological sort ile çöz
 *  2. Çalıştırılabilir görev sırası (execution queue) oluştur
 *  3. Ajan ataması yap (öncelik ve uzmanlık bazında)
 *  4. Paralel çalıştırılabilecek görev gruplarını belirle
 */

const { TASK_STATES, AGENT_ROSTER } = require("./mission-types");

// ── Ajan Uzmanlık Haritası ────────────────────────────────────────────────────

/** Her ajan için tercihli görev türleri (anahtar kelimeler) */
const AGENT_EXPERTISE = {
  planner:       ["plan", "analiz", "analiz et", "belirle", "değerlendir"],
  architect:     ["mimari", "tasarla", "yapı", "şema", "veri modeli", "architecture"],
  builder:       ["yaz", "kod", "implement", "build", "create", "function", "class"],
  backend:       ["api", "endpoint", "server", "route", "middleware", "veritabanı"],
  frontend:      ["ui", "html", "css", "renderer", "component", "style"],
  database:      ["db", "sql", "migration", "schema", "index", "query"],
  qa:            ["test", "spec", "review", "kontrol", "doğrula", "verify"],
  security:      ["güvenlik", "auth", "permission", "vulnerability", "sanitize"],
  performance:   ["hız", "optimize", "benchmark", "cache", "profil"],
  documentation: ["dokümantasyon", "yorum", "readme", "changelog", "comment"],
  git:           ["commit", "push", "tag", "branch", "merge", "release"],
  release:       ["sürüm", "versiyon", "deploy", "publish", "alpha", "beta"],
};

/**
 * Bir görev başlığından en uygun ajanı öner.
 * @param {string} taskTitle
 * @returns {string} agent name
 */
function suggestAgent(taskTitle) {
  const t = String(taskTitle || "").toLowerCase();
  let best = "builder";
  let bestScore = 0;
  for (const [agent, keywords] of Object.entries(AGENT_EXPERTISE)) {
    const score = keywords.filter(k => t.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = agent;
    }
  }
  return best;
}

// ── Topological Sort ─────────────────────────────────────────────────────────

/**
 * Görev listesini bağımlılık sırasına göre sıralar.
 * Döngüsel bağımlılık tespit edilirse hata fırlatır.
 *
 * @param {object[]} tasks  — { id, dependencies: [taskId, ...] }
 * @returns {object[]}      — sıralanmış tasks
 */
function topologicalSort(tasks) {
  const idSet   = new Set(tasks.map(t => t.id));
  const inDegree = new Map(tasks.map(t => [t.id, 0]));
  const adjList  = new Map(tasks.map(t => [t.id, []]));

  for (const task of tasks) {
    for (const dep of (task.dependencies || [])) {
      if (!idSet.has(dep)) continue; // dış bağımlılıkları görmezden gel
      adjList.get(dep).push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
    }
  }

  const queue  = tasks.filter(t => inDegree.get(t.id) === 0).map(t => t.id);
  const result = [];
  const visited = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(tasks.find(t => t.id === id));
    for (const next of (adjList.get(id) || [])) {
      const deg = inDegree.get(next) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (result.length < tasks.length) {
    throw new Error("[MissionScheduler] Döngüsel bağımlılık tespit edildi");
  }

  return result;
}

// ── Execution Queue ───────────────────────────────────────────────────────────

/**
 * Bir mission için execution queue oluşturur.
 *
 * Döndürülen yapı:
 * [
 *   { wave: 0, tasks: [task1, task2] },  // paralel çalıştırılabilir
 *   { wave: 1, tasks: [task3] },
 *   ...
 * ]
 *
 * @param {object} mission
 * @returns {object[]} wave listesi
 */
function buildExecutionQueue(mission) {
  const allTasks = mission.milestones.flatMap(ms =>
    ms.tasks.map(t => ({ ...t, _milestoneId: ms.id }))
  );

  if (!allTasks.length) return [];

  // Önce topological sort
  let sorted;
  try {
    sorted = topologicalSort(allTasks);
  } catch (e) {
    console.warn("[MissionScheduler]", e.message, "— sıralı fallback kullanılıyor");
    sorted = allTasks;
  }

  // Wave hesapla: aynı wave'deki task'lar paralel çalışabilir
  const waves    = [];
  const taskWave = new Map();

  for (const task of sorted) {
    const depWaves = (task.dependencies || [])
      .filter(dep => taskWave.has(dep))
      .map(dep => taskWave.get(dep));
    const wave = depWaves.length ? Math.max(...depWaves) + 1 : 0;
    taskWave.set(task.id, wave);
    if (!waves[wave]) waves[wave] = { wave, tasks: [] };
    waves[wave].tasks.push(task);
  }

  return waves.filter(Boolean);
}

/**
 * Execution queue'dan sonraki çalıştırılabilir task'ları döner.
 * Tamamlanmış ve aktif task'ları görmezden gelir.
 *
 * @param {object[]} queue       — buildExecutionQueue() çıktısı
 * @param {Set<string>} doneIds  — tamamlanmış task ID'leri
 * @returns {object[]}           — çalıştırılabilir task'lar
 */
function nextRunnableTasks(queue, doneIds = new Set()) {
  const runnable = [];
  for (const wave of queue) {
    // Tamamlanmamış VE done set'inde olmayan task'lar
    const pending = wave.tasks.filter(t =>
      !doneIds.has(t.id) &&
      (t.state === TASK_STATES.PENDING || t.state === TASK_STATES.QUEUED || t.state === TASK_STATES.ACTIVE)
    );

    if (!pending.length) continue; // bu wave tamamen bitti, sonrakine bak

    const ready = pending.filter(t =>
      (t.dependencies || []).every(dep => doneIds.has(dep))
    );
    runnable.push(...ready);
    if (ready.length < pending.length) break; // bazı task'lar hâlâ bloklu
  }
  return runnable;
}

/**
 * Mission'ı schedule eder:
 *  1. Ajan ataması olmayan task'lara ajan ata
 *  2. Execution queue hesapla
 *  3. Özet istatistik döner
 *
 * @param {object} mission
 * @returns {{ queue: object[], stats: object }}
 */
function scheduleMission(mission) {
  // Ajan ataması eksik task'ları düzelt
  for (const ms of mission.milestones) {
    for (const task of ms.tasks) {
      if (!task.agent || !AGENT_ROSTER.includes(task.agent)) {
        task.agent = suggestAgent(task.title);
      }
    }
  }

  const queue = buildExecutionQueue(mission);
  const totalTasks  = queue.flatMap(w => w.tasks).length;
  const totalWaves  = queue.length;
  const agentSet    = new Set(queue.flatMap(w => w.tasks.map(t => t.agent)));

  return {
    queue,
    stats: {
      totalTasks,
      totalWaves,
      agents:         [...agentSet],
      canParallelize: totalTasks > totalWaves,
    },
  };
}

module.exports = {
  suggestAgent,
  topologicalSort,
  buildExecutionQueue,
  nextRunnableTasks,
  scheduleMission,
};
