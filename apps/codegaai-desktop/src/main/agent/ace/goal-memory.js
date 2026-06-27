"use strict";
/**
 * Goal Memory — Hedef Belleği
 * Hedefler tüm konuşmalar boyunca yaşar.
 * Hiçbir zaman silinmez; sadece tamamlanır veya değişir.
 *
 * "CODEGA AI'yı Cursor'dan iyi yapmak istiyorum"
 * → 6 ay sonra hâlâ aktif, o günün kararlarını bağlar.
 */
const fs   = require("node:fs");
const path = require("node:path");

const GOAL_STATUS = Object.freeze({
  ACTIVE    : "active",
  ACHIEVED  : "achieved",
  PAUSED    : "paused",
  ABANDONED : "abandoned",
});

const GOAL_CATEGORY = Object.freeze({
  PRODUCT     : "product",
  TECHNICAL   : "technical",
  BUSINESS    : "business",
  LEARNING    : "learning",
  PERSONAL    : "personal",
});

class GoalMemory {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._path    = path.join(dataDir, "goal-memory.json");
    this._goals   = new Map();
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._path)) {
        const raw = JSON.parse(fs.readFileSync(this._path, "utf8"));
        for (const g of (raw.goals || [])) this._goals.set(g.id, g);
      }
    } catch (e) {
      console.warn("[GoalMemory] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._path, JSON.stringify({
        version: 1, savedAt: Date.now(),
        goals: [...this._goals.values()],
      }, null, 2), "utf8");
    } catch (e) { console.warn("[GoalMemory] save:", e.message); }
  }

  add({ title, description="", category=GOAL_CATEGORY.PRODUCT, priority=5, userId="default" }={}) {
    if (!title) throw new Error("Goal: title zorunlu");
    const id = `GOAL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
    const goal = {
      id, userId,
      title    : String(title).trim(),
      description: String(description).trim(),
      category, priority: Math.min(10, Math.max(1, Number(priority) || 5)),
      status   : GOAL_STATUS.ACTIVE,
      progress : 0,       // 0-100
      milestones: [],     // { label, achievedAt? }
      relatedProjects: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      achievedAt: null,
    };
    this._goals.set(id, goal);
    this._save();
    return goal;
  }

  update(id, changes={}) {
    const g = this._goals.get(id);
    if (!g) return null;
    const allowed = ["title","description","priority","progress","relatedProjects","status"];
    for (const k of allowed) if (k in changes) g[k] = changes[k];
    if (changes.status === GOAL_STATUS.ACHIEVED && !g.achievedAt) g.achievedAt = Date.now();
    g.updatedAt = Date.now();
    this._save();
    return g;
  }

  achieve(id) { return this.update(id, { status: GOAL_STATUS.ACHIEVED, progress: 100 }); }
  pause(id)   { return this.update(id, { status: GOAL_STATUS.PAUSED }); }
  abandon(id) { return this.update(id, { status: GOAL_STATUS.ABANDONED }); }

  addMilestone(goalId, label) {
    const g = this._goals.get(goalId);
    if (!g) return null;
    g.milestones.push({ label: String(label), achievedAt: null });
    g.updatedAt = Date.now();
    this._save();
    return g;
  }

  achieveMilestone(goalId, label) {
    const g = this._goals.get(goalId);
    if (!g) return null;
    const m = g.milestones.find(x => x.label === label);
    if (m) { m.achievedAt = Date.now(); g.updatedAt = Date.now(); this._save(); }
    return g;
  }

  active(userId=null) {
    let goals = [...this._goals.values()].filter(g => g.status === GOAL_STATUS.ACTIVE);
    if (userId) goals = goals.filter(g => g.userId === userId);
    return goals.sort((a,b) => b.priority - a.priority);
  }

  all(userId=null) {
    let goals = [...this._goals.values()];
    if (userId) goals = goals.filter(g => g.userId === userId);
    return goals.sort((a,b) => b.priority - a.priority);
  }

  /** LLM context'i için aktif hedefler */
  contextFor(userId=null) {
    const goals = this.active(userId);
    if (!goals.length) return "";
    const lines = ["# Aktif Hedefler"];
    for (const g of goals.slice(0, 5)) {
      lines.push(`- [P${g.priority}] **${g.title}**${g.description ? " — " + g.description.slice(0,80) : ""} (${g.progress}%)`);
    }
    return lines.join("\n");
  }

  summary(userId=null) {
    const all    = this.all(userId);
    const active = all.filter(g => g.status === GOAL_STATUS.ACTIVE);
    const done   = all.filter(g => g.status === GOAL_STATUS.ACHIEVED);
    return {
      total   : all.length,
      active  : active.length,
      achieved: done.length,
      topGoal : active[0]?.title || null,
    };
  }
}
module.exports = { GoalMemory, GOAL_STATUS, GOAL_CATEGORY };
