"use strict";

/**
 * mission-os.js — CODEGA AI MissionOS Ana Orkestratör (Singleton)
 *
 * Sprint 10: MissionOS
 *
 * "İnteraksiyon modeli artık prompt-driven değil, mission-driven."
 *
 * Her kullanıcı niyeti:
 *   Prompt → Mission → Milestones → Tasks → Agent Scheduler → Execution Queue
 *   → Progress Tracking → Review → Release
 *
 * Kullanım:
 *   const missionOS = require("./mission-os");
 *   await missionOS.init(dataDir);
 *   const mission = await missionOS.createMission("Yeni auth sistemi yaz", generateFn);
 *   await missionOS.execute(mission.id);
 */

const path = require("node:path");
const { EventEmitter } = require("node:events");

const { MissionStore }    = require("./mission-store");
const { planMission }     = require("./mission-planner");
const { scheduleMission } = require("./mission-scheduler");
const { MissionExecutor, stubAgentDispatch } = require("./mission-executor");
const {
  MISSION_STATES,
  TASK_STATES,
  createMission,
  createSelfReview,
  calcCompletionPercent,
  findTask,
} = require("./mission-types");

// ── MissionOS Singleton ───────────────────────────────────────────────────────

class MissionOS extends EventEmitter {
  constructor() {
    super();
    this._store    = null;
    this._executor = null;
    this._ready    = false;
    this._queued   = new Map(); // missionId → { queue, stats }
  }

  // ── Başlatma ───────────────────────────────────────────────────────────────

  /**
   * MissionOS'u başlat.
   * @param {string}   dataDir     — kalıcı depolama dizini
   * @param {Function} [dispatch]  — ajan dispatch fonksiyonu (opsiyonel)
   */
  async init(dataDir, dispatch = stubAgentDispatch) {
    if (this._ready) return this;
    if (!dataDir) throw new Error("MissionOS.init: dataDir gerekli");

    this._store    = new MissionStore(path.join(dataDir, "missions"));
    await this._store.init();

    this._executor = new MissionExecutor(this._store, dispatch);

    // Executor olaylarını yukarı köprüle
    for (const event of [
      "started", "review", "failed", "cancelled",
      "task:started", "task:completed", "task:failed",
      "progress",
    ]) {
      this._executor.on(event, data => this.emit(event, data));
    }

    this._ready = true;
    console.log("[MissionOS] Başlatıldı. Mevcut misyonlar:", this._store.count());
    return this;
  }

  // ── Mission Yaşam Döngüsü ─────────────────────────────────────────────────

  /**
   * Yeni bir mission oluşturur ve planlar.
   *
   * @param {string}   intent      — kullanıcı niyeti (doğal dil)
   * @param {Function} generateFn  — LLM çağrı fonksiyonu
   * @param {object}   [context]   — ek bağlam (codebase summary, vb.)
   * @returns {Promise<object>}    — plan yapılmış mission
   */
  async createMission(intent, generateFn, context = {}) {
    this._assertReady();

    // 1. LLM ile planla
    let mission;
    try {
      mission = await planMission(intent, generateFn, context);
    } catch (e) {
      console.error("[MissionOS] Planlama hatası:", e.message);
      throw e;
    }

    // 2. Schedule et (ajan ata, execution queue oluştur)
    const { queue, stats } = scheduleMission(mission);
    this._queued.set(mission.id, { queue, stats });

    // 3. State: SCHEDULED
    mission.state = MISSION_STATES.SCHEDULED;

    // 4. Kaydet
    await this._store.save(mission);

    this.emit("mission:created", { mission, stats });
    console.log(`[MissionOS] Mission oluşturuldu: ${mission.id} — "${mission.title}"`);
    return mission;
  }

  /**
   * Mevcut mission için execution başlat (SCHEDULED → ACTIVE).
   * @param {string} missionId
   * @returns {Promise<object>}
   */
  async execute(missionId) {
    this._assertReady();
    const mission = this._store.get(missionId);
    if (!mission) throw new Error(`Mission bulunamadı: ${missionId}`);
    if (mission.state !== MISSION_STATES.SCHEDULED) {
      throw new Error(`Mission çalıştırılamaz, mevcut state: ${mission.state}`);
    }
    return this._executor.execute(missionId);
  }

  /**
   * Mission'ı review'dan complete'e geçirir (insan onayı).
   * @param {string} missionId
   * @param {object} [reviewNote]
   * @returns {Promise<object>}
   */
  async approve(missionId, reviewNote = {}) {
    this._assertReady();
    return this._store.update(missionId, {
      state:       MISSION_STATES.COMPLETED,
      completedAt: Date.now(),
      selfReview:  reviewNote.selfReview || null,
    });
  }

  /**
   * Mission'ı release eder.
   * @param {string} missionId
   * @param {string} version  — "6.0.0-alpha.24"
   * @returns {Promise<object>}
   */
  async release(missionId, version) {
    this._assertReady();
    const mission = this._store.get(missionId);
    if (!mission) throw new Error(`Mission bulunamadı: ${missionId}`);
    const releases = [...(mission.releases || []), version];
    return this._store.update(missionId, {
      state:      MISSION_STATES.RELEASED,
      releasedAt: Date.now(),
      releases,
    });
  }

  /**
   * Mission'ı iptal eder.
   * @param {string} missionId
   * @returns {Promise<object>}
   */
  async cancel(missionId) {
    this._assertReady();
    if (this._executor.isRunning(missionId)) {
      this._executor.cancel(missionId);
    }
    return this._store.update(missionId, { state: MISSION_STATES.CANCELLED });
  }

  /**
   * Manuel mission oluşturur (LLM planı olmadan, doğrudan yapı ile).
   * Kullanıcı kendi milestones/tasks'ını tanımlamak istediğinde.
   * @param {object} opts  — createMission() seçenekleri
   * @returns {Promise<object>}
   */
  async createManualMission(opts) {
    this._assertReady();
    const mission = createMission({ ...opts, state: MISSION_STATES.SCHEDULED });
    const { queue, stats } = scheduleMission(mission);
    this._queued.set(mission.id, { queue, stats });
    await this._store.save(mission);
    this.emit("mission:created", { mission, stats });
    return mission;
  }

  // ── Tek Task İlerletme (manuel kontrol) ──────────────────────────────────

  /**
   * Tek bir task'ı manuel olarak COMPLETED'a taşır.
   * (Kullanıcı görevi dışarıda halletti, sistemi bilgilendiriyor)
   *
   * @param {string} missionId
   * @param {string} taskId
   * @param {object} result
   * @returns {Promise<object>} güncellenmiş mission
   */
  async completeTask(missionId, taskId, result = null) {
    this._assertReady();
    const mission = this._store.get(missionId);
    if (!mission) throw new Error(`Mission bulunamadı: ${missionId}`);
    const ref = findTask(mission, taskId);
    if (!ref) throw new Error(`Task bulunamadı: ${taskId}`);

    const milestones = mission.milestones.map(ms => ({
      ...ms,
      tasks: ms.tasks.map(t =>
        t.id === taskId
          ? { ...t, state: TASK_STATES.COMPLETED, result, completedAt: Date.now() }
          : t
      ),
    }));

    const updated = await this._store.update(missionId, {
      milestones,
      completionPercent: calcCompletionPercent({ ...mission, milestones }),
    });

    this.emit("task:completed", { missionId, taskId, result });
    return updated;
  }

  // ── Sorgular ─────────────────────────────────────────────────────────────

  getMission(id)          { this._assertReady(); return this._store.get(id); }
  listMissions(filter)    { this._assertReady(); return this._store.list(filter); }
  activeMissions()        { return this.listMissions(MISSION_STATES.ACTIVE);    }
  pendingMissions()       { return this.listMissions(MISSION_STATES.SCHEDULED); }
  completedMissions()     { return this.listMissions(MISSION_STATES.COMPLETED); }
  releasedMissions()      { return this.listMissions(MISSION_STATES.RELEASED);  }

  getExecutionQueue(missionId) {
    return this._queued.get(missionId) || null;
  }

  async recentEvents(n = 50) {
    this._assertReady();
    return this._store.recentEvents(n);
  }

  /**
   * Sistem özeti (dashboard için).
   */
  summary() {
    this._assertReady();
    const all = this._store.list();
    const byState = {};
    for (const m of all) {
      byState[m.state] = (byState[m.state] || 0) + 1;
    }
    return {
      total:      all.length,
      byState,
      running:    this._executor ? [...this._executor._running.keys()] : [],
    };
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  _assertReady() {
    if (!this._ready) throw new Error("MissionOS henüz başlatılmadı — init() çağrılmadı");
  }

  /** Ajan dispatch fonksiyonunu dışarıdan ayarla (bağımlılık enjeksiyonu). */
  setAgentDispatch(fn) {
    if (this._executor) {
      this._executor._dispatch = fn;
    }
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

const missionOS = new MissionOS();

async function initMissionOS(dataDir, dispatch) {
  return missionOS.init(dataDir, dispatch);
}

module.exports = { missionOS, initMissionOS, MissionOS };
