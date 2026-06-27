"use strict";
/**
 * Layer 5: User Brain — Kullanıcı Beyni
 * Kullanıcıyı ANLAYAN katman — sohbetleri hatırlamaz.
 *
 * Tercihler, mimari alışkanlıklar, karar kalıpları,
 * uzun vadeli hedefler, sık kullanılan teknolojiler.
 * Zaman içinde evrimleşir.
 */
const fs   = require("node:fs");
const path = require("node:path");

class UserBrain {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._path    = path.join(dataDir, "user-brain.json");
    this._users   = new Map();
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._path)) {
        const raw = JSON.parse(fs.readFileSync(this._path, "utf8"));
        for (const u of (raw.users || [])) this._users.set(u.id, u);
      }
    } catch (e) {
      console.warn("[UserBrain] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._path, JSON.stringify({
        version: 1, savedAt: Date.now(),
        users: [...this._users.values()],
      }, null, 2), "utf8");
    } catch (e) { console.warn("[UserBrain] save:", e.message); }
  }

  _ensure(userId) {
    if (!this._users.has(userId)) {
      this._users.set(userId, {
        id              : userId,
        name            : userId,
        languages       : [],    // PHP, JS, Python...
        frameworks      : [],    // Laravel, React...
        architecture    : [],    // "microservices", "monolith"...
        codingStyle     : [],    // "functional", "OOP"...
        businessDomains : [],    // "e-commerce", "SaaS"...
        preferredAnswers: [],    // "kod önce, açıklama sonra"...
        decisionPatterns: [],    // "prototipler önce test eder"...
        longTermGoals   : [],    // "CODEGA'yı Cursor'dan iyi yap"...
        activeProjects  : [],
        communicationStyle: null,
        observedAt      : Date.now(),
        updatedAt       : Date.now(),
        interactionCount: 0,
      });
    }
    return this._users.get(userId);
  }

  get(userId) { return this._users.get(userId) || null; }
  primary()   { return [...this._users.values()][0] || null; }

  observe(userId, { languages=[], frameworks=[], architecture=[], goals=[], domains=[], style=null } = {}) {
    const u = this._ensure(userId);
    const addUniq = (arr, items) => { for (const i of items) if (!arr.includes(i)) arr.push(i); };
    addUniq(u.languages, languages);
    addUniq(u.frameworks, frameworks);
    addUniq(u.architecture, architecture);
    addUniq(u.longTermGoals, goals);
    addUniq(u.businessDomains, domains);
    if (style) u.communicationStyle = style;
    u.updatedAt = Date.now();
    u.interactionCount++;
    this._save();
    return u;
  }

  addGoal(userId, goal) {
    const u = this._ensure(userId);
    if (!u.longTermGoals.includes(goal)) u.longTermGoals.push(goal);
    u.updatedAt = Date.now();
    this._save();
  }

  addProject(userId, projectLabel) {
    const u = this._ensure(userId);
    if (!u.activeProjects.includes(projectLabel)) u.activeProjects.push(projectLabel);
    u.updatedAt = Date.now();
    this._save();
  }

  addDecisionPattern(userId, pattern) {
    const u = this._ensure(userId);
    if (!u.decisionPatterns.includes(pattern)) u.decisionPatterns.push(pattern);
    u.updatedAt = Date.now();
    this._save();
  }

  /** LLM context'i için kullanıcı profili */
  contextFor(userId) {
    const u = this._users.get(userId);
    if (!u) return "Kullanıcı henüz tanınmıyor.";
    const lines = [`# Kullanıcı: ${u.name}`];
    if (u.languages.length)       lines.push(`**Diller:** ${u.languages.join(", ")}`);
    if (u.frameworks.length)      lines.push(`**Framework'ler:** ${u.frameworks.join(", ")}`);
    if (u.architecture.length)    lines.push(`**Mimari Tercihi:** ${u.architecture.join(", ")}`);
    if (u.longTermGoals.length)   lines.push(`**Uzun Vadeli Hedefler:**\n${u.longTermGoals.map(g=>`- ${g}`).join("\n")}`);
    if (u.decisionPatterns.length) lines.push(`**Karar Kalıpları:** ${u.decisionPatterns.join("; ")}`);
    if (u.activeProjects.length)  lines.push(`**Aktif Projeler:** ${u.activeProjects.slice(-3).join(", ")}`);
    return lines.join("\n");
  }

  summary() {
    const primary = this.primary();
    if (!primary) return { known: false };
    return {
      known          : true,
      name           : primary.name,
      languages      : primary.languages,
      goalCount      : primary.longTermGoals.length,
      activeProjects : primary.activeProjects.slice(-3),
      interactions   : primary.interactionCount,
    };
  }
}
module.exports = { UserBrain };
