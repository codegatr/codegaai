"use strict";

/**
 * mission-store.js — CODEGA AI MissionOS Kalıcı Depolama
 *
 * Sprint 10: MissionOS
 *
 * Depolama formatı:
 *   <dataDir>/missions.json        → tüm mission nesneleri (Map<id, mission>)
 *   <dataDir>/mission-events.jsonl → event log (audit trail)
 *
 * Her kaydetmede sadece değişen mission yazılır (diff-friendly).
 */

const path = require("node:path");
const fsp  = require("node:fs/promises");
const fs   = require("node:fs");

const MISSIONS_FILE = "missions.json";
const EVENTS_FILE   = "mission-events.jsonl";
const MAX_LOG_LINES = 10_000;

class MissionStore {
  /**
   * @param {string} dataDir — kalıcı dizin (Electron userData altında)
   */
  constructor(dataDir) {
    if (!dataDir) throw new Error("MissionStore: dataDir gerekli");
    this._dir    = dataDir;
    this._file   = path.join(dataDir, MISSIONS_FILE);
    this._events = path.join(dataDir, EVENTS_FILE);
    /** @type {Map<string, object>} mission id → mission */
    this._missions = new Map();
    this._ready    = false;
  }

  // ── Başlatma ───────────────────────────────────────────────────────────────

  async init() {
    if (this._ready) return this;
    await fsp.mkdir(this._dir, { recursive: true });
    await this._load();
    this._ready = true;
    return this;
  }

  async _load() {
    try {
      const raw = await fsp.readFile(this._file, "utf8");
      const list = JSON.parse(raw);
      this._missions = new Map(list.map(m => [m.id, m]));
    } catch (e) {
      if (e.code !== "ENOENT") {
        console.warn("[MissionStore] missions.json yüklenemedi:", e.message);
      }
      this._missions = new Map();
    }
  }

  async _save() {
    const list = [...this._missions.values()];
    await fsp.writeFile(this._file, JSON.stringify(list, null, 2), "utf8");
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /** Yeni mission kaydet */
  async save(mission) {
    this._assertReady();
    this._missions.set(mission.id, mission);
    await this._save();
    await this._appendEvent("save", mission.id, { state: mission.state });
    return mission;
  }

  /** Mission güncelle (partial merge) */
  async update(id, patch) {
    this._assertReady();
    const existing = this._missions.get(id);
    if (!existing) throw new Error(`Mission bulunamadı: ${id}`);
    const updated = { ...existing, ...patch };
    this._missions.set(id, updated);
    await this._save();
    await this._appendEvent("update", id, patch);
    return updated;
  }

  /** Tek mission getir */
  get(id) {
    this._assertReady();
    return this._missions.get(id) || null;
  }

  /** Tüm missionları listele (opsiyonel state filtresi) */
  list(stateFilter = null) {
    this._assertReady();
    const all = [...this._missions.values()];
    if (!stateFilter) return all;
    return all.filter(m => m.state === stateFilter);
  }

  /** Mission sil */
  async remove(id) {
    this._assertReady();
    this._missions.delete(id);
    await this._save();
    await this._appendEvent("remove", id, {});
  }

  /** Toplam mission sayısı */
  count() {
    return this._missions.size;
  }

  // ── Event Log ──────────────────────────────────────────────────────────────

  async _appendEvent(type, missionId, data) {
    const entry = JSON.stringify({
      ts:        Date.now(),
      type,
      missionId,
      ...data,
    });
    try {
      await fsp.appendFile(this._events, entry + "\n", "utf8");
      await this._trimEventsIfNeeded();
    } catch (_) { /* log yazma hatası kritik değil */ }
  }

  async _trimEventsIfNeeded() {
    try {
      const content = await fsp.readFile(this._events, "utf8");
      const lines   = content.split("\n").filter(Boolean);
      if (lines.length > MAX_LOG_LINES) {
        const trimmed = lines.slice(-MAX_LOG_LINES).join("\n") + "\n";
        await fsp.writeFile(this._events, trimmed, "utf8");
      }
    } catch (_) {}
  }

  /**
   * Son N event'i döner (audit trail için).
   * @param {number} n
   * @returns {object[]}
   */
  async recentEvents(n = 50) {
    try {
      const content = await fsp.readFile(this._events, "utf8");
      const lines = content.split("\n").filter(Boolean);
      return lines.slice(-n).map(l => JSON.parse(l)).reverse();
    } catch (_) {
      return [];
    }
  }

  // ── Yardımcılar ────────────────────────────────────────────────────────────

  _assertReady() {
    if (!this._ready) throw new Error("MissionStore henüz başlatılmadı — init() çağrılmadı");
  }

  /** Diske senkron anlık snapshot al (test yardımcısı). */
  snapshot() {
    return [...this._missions.values()];
  }
}

module.exports = { MissionStore };
