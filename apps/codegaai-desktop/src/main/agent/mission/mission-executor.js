"use strict";

/**
 * mission-executor.js — CODEGA AI Mission Çalıştırıcı
 *
 * Sprint 10: MissionOS
 *
 * Sorumluluklar:
 *  1. Execution queue'dan bir sonraki task'ı al
 *  2. İlgili ajan'ı çağır (agent dispatch)
 *  3. Sonucu kaydet, state'i güncelle
 *  4. Hata durumunda rollback mekanizmasını tetikle
 *  5. İlerleme event'leri yayınla (EventEmitter tabanlı)
 *
 * Bu modül bağımsızdır — doğrudan agent implementasyonlarına bağımlı değil.
 * Ajan dispatch fonksiyonları dışarıdan enjekte edilir (Dependency Injection).
 */

const { EventEmitter } = require("node:events");
const {
  MISSION_STATES,
  TASK_STATES,
  MILESTONE_STATES,
  calcCompletionPercent,
  findTask,
} = require("./mission-types");
const { buildExecutionQueue, nextRunnableTasks } = require("./mission-scheduler");

// ── MissionExecutor ───────────────────────────────────────────────────────────

class MissionExecutor extends EventEmitter {
  /**
   * @param {object}   missionStore — MissionStore instance
   * @param {Function} agentDispatch — async ({ mission, task }) => { result, error }
   */
  constructor(missionStore, agentDispatch) {
    super();
    if (!missionStore)  throw new Error("MissionExecutor: missionStore gerekli");
    if (!agentDispatch) throw new Error("MissionExecutor: agentDispatch gerekli");
    this._store    = missionStore;
    this._dispatch = agentDispatch;
    this._running  = new Map(); // missionId → { abortController }
  }

  // ── Çalıştırma ────────────────────────────────────────────────────────────

  /**
   * Bir mission'ı çalıştırır.
   * Mevcut state: SCHEDULED → ACTIVE → REVIEW (başarı) veya FAILED (hata)
   *
   * @param {string} missionId
   * @returns {Promise<object>} tamamlanan mission
   */
  async execute(missionId) {
    let mission = this._store.get(missionId);
    if (!mission) throw new Error(`Mission bulunamadı: ${missionId}`);
    if (this._running.has(missionId)) throw new Error(`Mission zaten çalışıyor: ${missionId}`);

    const abort = { cancelled: false };
    this._running.set(missionId, abort);

    // State: ACTIVE
    mission = await this._store.update(missionId, {
      state:     MISSION_STATES.ACTIVE,
      startedAt: Date.now(),
    });
    this._emit("started", mission);

    try {
      const queue = buildExecutionQueue(mission);
      const done  = new Set(
        mission.milestones
          .flatMap(ms => ms.tasks)
          .filter(t => t.state === TASK_STATES.COMPLETED)
          .map(t => t.id)
      );

      while (!abort.cancelled) {
        const runnable = nextRunnableTasks(queue, done);
        if (!runnable.length) break;

        // Şimdilik sıralı çalıştır (gelecekte paralel yapılabilir)
        for (const taskRef of runnable) {
          if (abort.cancelled) break;
          await this._executeTask(missionId, taskRef.id);
          done.add(taskRef.id);
        }
      }

      // Son state hesapla
      mission = this._store.get(missionId);
      const allTasks   = mission.milestones.flatMap(ms => ms.tasks);
      const allDone    = allTasks.every(t =>
        t.state === TASK_STATES.COMPLETED || t.state === TASK_STATES.SKIPPED
      );
      const anyFailed  = allTasks.some(t => t.state === TASK_STATES.FAILED);

      if (abort.cancelled) {
        mission = await this._store.update(missionId, { state: MISSION_STATES.CANCELLED });
        this._emit("cancelled", mission);
      } else if (anyFailed) {
        mission = await this._store.update(missionId, {
          state:       MISSION_STATES.FAILED,
          completedAt: Date.now(),
          completionPercent: calcCompletionPercent(mission),
        });
        this._emit("failed", mission);
      } else {
        mission = await this._store.update(missionId, {
          state:             MISSION_STATES.REVIEW,
          completedAt:       Date.now(),
          completionPercent: 100,
        });
        this._emit("review", mission);
      }

      return mission;
    } finally {
      this._running.delete(missionId);
    }
  }

  /**
   * Tek bir task'ı çalıştırır.
   */
  async _executeTask(missionId, taskId) {
    let mission = this._store.get(missionId);
    const ref   = findTask(mission, taskId);
    if (!ref) return;

    const { milestone, task } = ref;

    // Task → ACTIVE
    await this._updateTask(missionId, taskId, {
      state:     TASK_STATES.ACTIVE,
      startedAt: Date.now(),
    });

    // Milestone → ACTIVE (eğer ilk task ise)
    if (milestone.state === MILESTONE_STATES.PENDING) {
      await this._updateMilestone(missionId, milestone.id, { state: MILESTONE_STATES.ACTIVE });
    }

    this._emit("task:started", { missionId, task: { ...task, state: TASK_STATES.ACTIVE } });

    const startMs = Date.now();
    let result, error;
    try {
      result = await this._dispatch({ mission, task });
    } catch (e) {
      error = String(e?.message || e);
    }

    const durationMs = Date.now() - startMs;

    if (error) {
      await this._updateTask(missionId, taskId, {
        state:       TASK_STATES.FAILED,
        error,
        durationMs,
        completedAt: Date.now(),
      });
      this._emit("task:failed", { missionId, taskId, error });
    } else {
      await this._updateTask(missionId, taskId, {
        state:       TASK_STATES.COMPLETED,
        result,
        durationMs,
        completedAt: Date.now(),
      });
      this._emit("task:completed", { missionId, taskId, result, durationMs });
    }

    // Milestone tüm task'ları bitti mi kontrol et
    mission = this._store.get(missionId);
    const ms = mission.milestones.find(m => m.id === milestone.id);
    if (ms) {
      const allDone = ms.tasks.every(t =>
        t.state === TASK_STATES.COMPLETED || t.state === TASK_STATES.SKIPPED
      );
      if (allDone) {
        await this._updateMilestone(missionId, ms.id, {
          state:       MILESTONE_STATES.COMPLETED,
          completedAt: Date.now(),
        });
      }
    }

    // Completion percent güncelle
    mission = this._store.get(missionId);
    const pct = calcCompletionPercent(mission);
    await this._store.update(missionId, { completionPercent: pct });
    this._emit("progress", { missionId, completionPercent: pct });
  }

  // ── İptal ─────────────────────────────────────────────────────────────────

  /**
   * Çalışan mission'ı iptal eder.
   */
  cancel(missionId) {
    const ctrl = this._running.get(missionId);
    if (ctrl) ctrl.cancelled = true;
  }

  isRunning(missionId) {
    return this._running.has(missionId);
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  async _updateTask(missionId, taskId, patch) {
    const mission = this._store.get(missionId);
    if (!mission) return;
    const milestones = mission.milestones.map(ms => ({
      ...ms,
      tasks: ms.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t),
    }));
    await this._store.update(missionId, { milestones });
  }

  async _updateMilestone(missionId, msId, patch) {
    const mission = this._store.get(missionId);
    if (!mission) return;
    const milestones = mission.milestones.map(ms =>
      ms.id === msId ? { ...ms, ...patch } : ms
    );
    await this._store.update(missionId, { milestones });
  }

  _emit(event, data) {
    try {
      this.emit(event, data);
    } catch (_) {}
  }
}

// ── Varsayılan Ajan Dispatch ─────────────────────────────────────────────────

/**
 * Gerçek ajan implementasyonları olmadığında kullanılan stub dispatch.
 * Gerçek implementasyon mission-os.js'te inject edilir.
 *
 * @param {{ mission, task }} ctx
 * @returns {{ result: string }}
 */
async function stubAgentDispatch({ mission, task }) {
  // Gerçekte: ajan'a görevi ilet, sonuç bekle
  return {
    result: `[${task.agent}] "${task.title}" tamamlandı.`,
    agentId: task.agent,
    taskId:  task.id,
  };
}

module.exports = { MissionExecutor, stubAgentDispatch };
