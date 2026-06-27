"use strict";

/**
 * evolution-engine.js — CODEGA AI Phoenix Evolution Engine
 *
 * Sprint 11: Evolution Engine
 *
 * "CODEGA AI, kendisini her gün analiz eder, teknik borcu tespit eder,
 *  iyileştirme önerileri üretir ve mühendislik raporları yayınlar.
 *  Ama ASLA production'a otomatik dokunmaz. Her merge insan onayı gerektirir."
 *
 * Analiz kapsamı:
 *  - Mimari sağlığı (modül sayısı, boyut, organizasyon)
 *  - Teknik borç (büyük dosyalar, tekrar eden pattern'ler)
 *  - Test kapsamı tahmini (test/kaynak dosyası oranı)
 *  - IPC karmaşıklığı
 *  - Agent modül kalitesi
 *  - Bağımlılık sağlığı
 */

const path = require("node:path");
const fsp  = require("node:fs/promises");
const fs   = require("node:fs");

// ── Sabitler ──────────────────────────────────────────────────────────────────

const LARGE_FILE_THRESHOLD   = 500;   // satır — bu üstü borç sinyali
const HUGE_FILE_THRESHOLD    = 1000;  // satır — kritik borç
const IDEAL_TEST_RATIO       = 0.3;   // test dosyası / kaynak dosyası oranı

// ── EvolutionEngine ───────────────────────────────────────────────────────────

class EvolutionEngine {
  /**
   * @param {string} projectRoot — analiz edilecek kök dizin
   * @param {string} dataDir     — rapor depolama dizini
   */
  constructor(projectRoot, dataDir) {
    this._root    = projectRoot;
    this._dataDir = dataDir;
    this._reportsFile = dataDir ? path.join(dataDir, "evolution-reports.json") : null;
  }

  async init() {
    if (this._dataDir) {
      await fsp.mkdir(this._dataDir, { recursive: true });
    }
    return this;
  }

  // ── Ana Analiz ────────────────────────────────────────────────────────────

  /**
   * Tam mimari analiz çalıştır.
   * @returns {Promise<object>} EvolutionReport
   */
  async analyze() {
    const ts = Date.now();

    const [
      agentStats,
      testStats,
      ipcStats,
      debtItems,
      depStats,
    ] = await Promise.all([
      this._analyzeAgentModules(),
      this._analyzeTestCoverage(),
      this._analyzeIpcComplexity(),
      this._scanTechnicalDebt(),
      this._analyzeDependencies(),
    ]);

    // ── Skorlar (0-100) ───────────────────────────────────────────────────────
    const architectureScore  = this._calcArchitectureScore(agentStats, debtItems);
    const testCoverageScore  = Math.min(100, Math.round(testStats.ratio * 100 / IDEAL_TEST_RATIO));
    const complexityScore    = this._calcComplexityScore(debtItems);
    const maintainability    = Math.round((architectureScore + testCoverageScore + complexityScore) / 3);

    const report = {
      id:          `evo_${ts}`,
      analyzedAt:  ts,
      version:     await this._readVersion(),
      scores: {
        architecture: architectureScore,
        testCoverage: testCoverageScore,
        complexity:   complexityScore,
        maintainability,
        overall:      Math.round((architectureScore + testCoverageScore + complexityScore) / 3),
      },
      modules: {
        agent:     agentStats,
        test:      testStats,
        ipc:       ipcStats,
      },
      technicalDebt: debtItems,
      dependencies:  depStats,
      improvements:  this._generateImprovements(debtItems, testStats, agentStats),
      engineeringTodos: this._generateTodos(debtItems, testStats),
    };

    await this._saveReport(report);
    return report;
  }

  // ── Modül Analizleri ──────────────────────────────────────────────────────

  async _analyzeAgentModules() {
    const agentDir = path.join(this._root, "src", "main", "agent");
    let files = [];
    try {
      files = await this._listJsFiles(agentDir);
    } catch (_) { return { count: 0, totalLines: 0, avgLines: 0, large: [], modules: [] }; }

    const modules = [];
    let totalLines = 0;
    const large = [];

    for (const f of files) {
      try {
        const content = await fsp.readFile(f, "utf8");
        const lines   = content.split("\n").length;
        totalLines += lines;
        const name = path.relative(agentDir, f);
        modules.push({ name, lines });
        if (lines >= LARGE_FILE_THRESHOLD) {
          large.push({ name, lines, critical: lines >= HUGE_FILE_THRESHOLD });
        }
      } catch (_) {}
    }

    return {
      count:      files.length,
      totalLines,
      avgLines:   files.length ? Math.round(totalLines / files.length) : 0,
      large,
      modules:    modules.sort((a, b) => b.lines - a.lines).slice(0, 15),
    };
  }

  async _analyzeTestCoverage() {
    const testDir   = path.join(this._root, "src", "main", "agent", "__tests__");
    const sourceDir = path.join(this._root, "src", "main", "agent");

    let testCount = 0, sourceCount = 0;
    let testFiles = [], describeCount = 0, itCount = 0;

    try {
      const files = await this._listJsFiles(testDir);
      testCount = files.length;
      testFiles = files.map(f => path.basename(f));
      for (const f of files) {
        const content = await fsp.readFile(f, "utf8");
        describeCount += (content.match(/describe\(/g) || []).length;
        itCount       += (content.match(/\bit\(|\btest\(/g) || []).length;
      }
    } catch (_) {}

    try {
      const files = await this._listJsFiles(sourceDir, false); // non-recursive
      sourceCount = files.length;
    } catch (_) {}

    return {
      testFiles:    testCount,
      sourceFiles:  sourceCount,
      ratio:        sourceCount ? testCount / sourceCount : 0,
      describes:    describeCount,
      itBlocks:     itCount,
      files:        testFiles,
    };
  }

  async _analyzeIpcComplexity() {
    const mainFile = path.join(this._root, "src", "main", "main.js");
    let ipcHandlers = 0, totalLines = 0;
    try {
      const content = await fsp.readFile(mainFile, "utf8");
      totalLines    = content.split("\n").length;
      ipcHandlers   = (content.match(/ipcMain\.handle\(/g) || []).length;
    } catch (_) {}

    return {
      handlers:   ipcHandlers,
      mainLines:  totalLines,
      risk:       totalLines > 1200 ? "high" : totalLines > 800 ? "medium" : "low",
    };
  }

  async _scanTechnicalDebt() {
    const items = [];
    const agentDir = path.join(this._root, "src", "main");

    try {
      const files = await this._listJsFiles(agentDir);
      for (const f of files) {
        const content = await fsp.readFile(f, "utf8");
        const lines   = content.split("\n").length;
        const name    = path.relative(this._root, f);

        if (lines >= HUGE_FILE_THRESHOLD) {
          items.push({
            type:     "huge-file",
            severity: "critical",
            file:     name,
            lines,
            message:  `${name} (${lines} satır) — bölünmeli`,
          });
        } else if (lines >= LARGE_FILE_THRESHOLD) {
          items.push({
            type:     "large-file",
            severity: "warning",
            file:     name,
            lines,
            message:  `${name} (${lines} satır) — refactor adayı`,
          });
        }

        // TODO sayısı
        const todos = (content.match(/\/\/\s*TODO/gi) || []).length;
        if (todos > 3) {
          items.push({
            type:     "todo-debt",
            severity: "info",
            file:     name,
            count:    todos,
            message:  `${name} — ${todos} adet TODO`,
          });
        }

        // console.log kullanımı (prod'da debug kalıntısı)
        const consoleLogs = (content.match(/console\.log\(/g) || []).length;
        if (consoleLogs > 5) {
          items.push({
            type:     "console-log",
            severity: "info",
            file:     name,
            count:    consoleLogs,
            message:  `${name} — ${consoleLogs} console.log (temizlenmeli)`,
          });
        }
      }
    } catch (_) {}

    return items.sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2 };
      return (rank[a.severity] || 99) - (rank[b.severity] || 99);
    });
  }

  async _analyzeDependencies() {
    const pkgFile = path.join(this._root, "package.json");
    try {
      const pkg  = JSON.parse(await fsp.readFile(pkgFile, "utf8"));
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      return {
        total:    deps.length + devDeps.length,
        prod:     deps.length,
        dev:      devDeps.length,
        electron: deps.find(d => d === "electron") ? "yes" : "no",
      };
    } catch (_) {
      return { total: 0, prod: 0, dev: 0 };
    }
  }

  // ── Skor Hesapları ────────────────────────────────────────────────────────

  _calcArchitectureScore(agentStats, debtItems) {
    let score = 100;
    const criticals = debtItems.filter(d => d.severity === "critical").length;
    const warnings  = debtItems.filter(d => d.severity === "warning").length;
    score -= criticals * 15;
    score -= warnings  * 5;
    if (agentStats.avgLines > 400) score -= 10;
    if (agentStats.count > 100) score -= 5; // çok sayıda küçük dosya
    return Math.max(0, Math.min(100, score));
  }

  _calcComplexityScore(debtItems) {
    let score = 100;
    for (const item of debtItems) {
      if (item.severity === "critical") score -= 20;
      else if (item.severity === "warning") score -= 8;
      else score -= 2;
    }
    return Math.max(0, Math.min(100, score));
  }

  // ── İyileştirme Önerileri ────────────────────────────────────────────────

  _generateImprovements(debtItems, testStats, agentStats) {
    const proposals = [];

    if (testStats.ratio < IDEAL_TEST_RATIO) {
      proposals.push({
        id:       "improve-test-coverage",
        priority: "high",
        title:    "Test kapsamını artır",
        detail:   `Mevcut test oranı %.${(testStats.ratio * 100).toFixed(0)} — hedef %30+`,
        effort:   "medium",
        impact:   "high",
      });
    }

    const hugeCandidates = debtItems.filter(d => d.type === "huge-file");
    for (const c of hugeCandidates.slice(0, 3)) {
      proposals.push({
        id:       `split-${path.basename(c.file)}`,
        priority: "critical",
        title:    `${path.basename(c.file)} dosyasını böl`,
        detail:   `${c.lines} satır — sorumluluk ayrıştırması gerekiyor`,
        effort:   "high",
        impact:   "high",
      });
    }

    if (agentStats.avgLines > 350) {
      proposals.push({
        id:       "reduce-module-size",
        priority: "medium",
        title:    "Ortalama modül boyutunu düşür",
        detail:   `Ortalama ${agentStats.avgLines} satır — hedef <300`,
        effort:   "medium",
        impact:   "medium",
      });
    }

    return proposals;
  }

  _generateTodos(debtItems, testStats) {
    const todos = [];
    const consoleLogs = debtItems.filter(d => d.type === "console-log");
    if (consoleLogs.length) {
      todos.push(`console.log temizliği: ${consoleLogs.length} dosya`);
    }
    const todoDebt = debtItems.filter(d => d.type === "todo-debt");
    if (todoDebt.length) {
      const total = todoDebt.reduce((s, d) => s + (d.count || 0), 0);
      todos.push(`${total} adet TODO yorumunu çöz`);
    }
    if (testStats.ratio < 0.2) {
      todos.push("Kritik modüller için birim test yaz (oran çok düşük)");
    }
    return todos;
  }

  // ── Rapor Kaydetme ────────────────────────────────────────────────────────

  async _saveReport(report) {
    if (!this._reportsFile) return;
    let reports = [];
    try {
      const raw = await fsp.readFile(this._reportsFile, "utf8");
      reports = JSON.parse(raw);
    } catch (_) {}
    reports.push(report);
    if (reports.length > 30) reports = reports.slice(-30); // son 30 rapor
    await fsp.writeFile(this._reportsFile, JSON.stringify(reports, null, 2), "utf8");
  }

  async loadReports(n = 10) {
    if (!this._reportsFile) return [];
    try {
      const raw = JSON.parse(await fsp.readFile(this._reportsFile, "utf8"));
      return raw.slice(-n).reverse();
    } catch (_) { return []; }
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  async _listJsFiles(dir, recursive = true) {
    const results = [];
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (_) { return results; }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && recursive && !e.name.startsWith(".") && e.name !== "node_modules") {
        results.push(...await this._listJsFiles(full, recursive));
      } else if (e.isFile() && e.name.endsWith(".js")) {
        results.push(full);
      }
    }
    return results;
  }

  async _readVersion() {
    try {
      const pkg = JSON.parse(
        await fsp.readFile(path.join(this._root, "package.json"), "utf8")
      );
      return pkg.version || "unknown";
    } catch (_) { return "unknown"; }
  }
}

module.exports = { EvolutionEngine };
