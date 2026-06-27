"use strict";
/**
 * Layer 4: Project Brain — Proje Beyni
 * Bir proje hakkındaki tüm canlı anlayış.
 * Asla kaybolmaz. Her sprint ile büyür.
 *
 * İçerir: Mimari, iş kuralları, klasör yapısı, veritabanı,
 * kodlama standartları, açık TODO'lar, tamamlanan görevler,
 * teknik borç, bilinen buglar, gelecek yol haritası.
 */
const fs   = require("node:fs");
const path = require("node:path");

class ProjectBrain {
  constructor(dataDir) {
    this._dataDir  = dataDir;
    this._path     = path.join(dataDir, "project-brains.json");
    this._projects = new Map();  // label → ProjectMemory
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._path)) {
        const raw = JSON.parse(fs.readFileSync(this._path, "utf8"));
        for (const p of (raw.projects || [])) this._projects.set(p.label, p);
      }
    } catch (e) {
      console.warn("[ProjectBrain] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._path, JSON.stringify({
        version : 1,
        savedAt : Date.now(),
        projects: [...this._projects.values()],
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("[ProjectBrain] save:", e.message);
    }
  }

  _ensure(label) {
    if (!this._projects.has(label)) {
      this._projects.set(label, {
        label,
        architecture    : [],
        businessRules   : [],
        folderStructure : [],
        databases       : [],
        codingStandards : [],
        openTodos       : [],
        completedMissions: [],
        techDebt        : [],
        knownBugs       : [],
        roadmap         : [],
        technologies    : [],
        currentMilestone: null,
        lastActivity    : Date.now(),
        createdAt       : Date.now(),
      });
    }
    return this._projects.get(label);
  }

  get(label)         { return this._projects.get(label) || null; }
  getProject(label)  { return this._projects.get(label) || null; }
  getOrCreate(label) { return this._ensure(label); }
  list()             { return [...this._projects.values()]; }

  /** En son aktif proje */
  mostRecent() {
    const projects = [...this._projects.values()];
    if (!projects.length) return null;
    return projects.sort((a, b) => b.lastActivity - a.lastActivity)[0];
  }

  touch(label) {
    const p = this._ensure(label);
    p.lastActivity = Date.now();
    this._save();
    return p;
  }

  // ── Bilgi Güncelleme ─────────────────────────────────────────────────────────

  addArchitecture(label, item)      { this._append(label, "architecture",     item, 20); }
  addBusinessRule(label, item)      { this._append(label, "businessRules",    item, 30); }
  addTechDebt(label, item)          { this._append(label, "techDebt",         item, 50); }
  addKnownBug(label, item)          { this._append(label, "knownBugs",        item, 50); }
  addRoadmapItem(label, item)       { this._append(label, "roadmap",          item, 50); }
  addTechnology(label, tech)        { this._append(label, "technologies",     tech, 30); }
  addOpenTodo(label, todo)          { this._append(label, "openTodos",        todo, 100); }
  completeMission(label, mission)   { this._append(label, "completedMissions",mission, 200); }
  setMilestone(label, milestone)    { const p = this._ensure(label); p.currentMilestone = milestone; p.lastActivity = Date.now(); this._save(); }

  resolveTodo(label, todo) {
    const p = this._ensure(label);
    p.openTodos = p.openTodos.filter(t => t !== todo);
    p.lastActivity = Date.now();
    this._save();
  }

  _append(label, field, item, max) {
    const p = this._ensure(label);
    if (!p[field].includes(item)) {
      p[field].push(item);
      if (p[field].length > max) p[field].shift();
    }
    p.lastActivity = Date.now();
    this._save();
  }

  /**
   * Proje anlayış özeti — LLM'e context olarak verilir.
   */
  contextFor(label) {
    const p = this._projects.get(label);
    if (!p) return `"${label}" projesi henüz bilinmiyor.`;

    const lines = [`# Proje: ${p.label}`];
    if (p.currentMilestone) lines.push(`**Mevcut Milestone:** ${p.currentMilestone}`);
    if (p.architecture.length) lines.push(`**Mimari:** ${p.architecture.slice(-5).join(", ")}`);
    if (p.technologies.length) lines.push(`**Teknolojiler:** ${p.technologies.join(", ")}`);
    if (p.openTodos.length)    lines.push(`**Açık TODO'lar (${p.openTodos.length}):** ${p.openTodos.slice(-3).join(" | ")}`);
    if (p.knownBugs.length)    lines.push(`**Bilinen Buglar:** ${p.knownBugs.slice(-3).join(" | ")}`);
    if (p.techDebt.length)     lines.push(`**Teknik Borç:** ${p.techDebt.slice(-3).join(" | ")}`);
    if (p.roadmap.length)      lines.push(`**Yol Haritası:** ${p.roadmap.slice(-3).join(" | ")}`);
    if (p.completedMissions.length) lines.push(`**Tamamlanan (son 3):** ${p.completedMissions.slice(-3).join(", ")}`);
    return lines.join("\n");
  }


  summary() {
    const all = [...this._projects.values()];
    return {
      count   : all.length,
      projects: all.map(p => ({
        label       : p.label,
        openTodos   : p.openTodos.length,
        knownBugs   : p.knownBugs.length,
        lastActivity: p.lastActivity,
      })),
    };
  }
}
module.exports = { ProjectBrain };
