"use strict";

/**
 * aep-os.js — Autonomous Evolution Platform Orkestratör
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Otonom Evrim Döngüsü:
 *   Kod Yaz → Kendini Analiz Et → Eksikleri Bul →
 *   Engineering Backlog'a Görev Aç → Görevleri Önceliklendir →
 *   Patch Hazırla → Test Et → Benchmark Yap →
 *   Pull Request Aç → İnsan Onayı → Merge →
 *   Yeni Öğrenilenleri Hafızaya Kaydet → Tekrar Analiz Et
 *
 * KURAL: İnsan onayı olmadan ASLA merge edilmez.
 */

const path         = require("node:path");
const { EventEmitter } = require("node:events");

const { EngineeringBacklog, getBacklog, SEVERITY, CATEGORY, TASK_STATUS } = require("./engineering-backlog");
const { ImprovementPlanner, PROPOSAL_STATUS }  = require("./improvement-planner");
const { EngineeringScorecard }                  = require("./engineering-score");
const { PatchGenerator }                        = require("./patch-generator");
const { LearningDatabase, LEARNING_TYPE }       = require("./learning-db");
const { CompetitiveIntel }                      = require("./competitive-intel");
const { CODEGAEG }                              = require("./ceg");
const { EngineeringTimeline }                   = require("./engineering-timeline");
const { SEED_TIMELINE }                         = require("./timeline-seed");

class AEPOS extends EventEmitter {
  constructor() {
    super();
    this._initialized  = false;
    this._dataDir      = null;
    this._projectRoot  = null;
    this._generateFn   = null;
    this._githubConfig = null;

    // Modüller
    this.backlog    = null;
    this.planner    = null;
    this.scorecard  = null;
    this.patcher    = null;
    this.learning   = null;
    this.intel      = null;
    this.genome     = null;
    this.timeline   = null;

    this._analysisInProgress = false;
  }

  /**
   * @param {object} opts
   * @param {string}   opts.dataDir       — AEP veri dizini
   * @param {string}   opts.projectRoot   — repo kökü
   * @param {Function} opts.generateFn    — LLM çağrısı
   * @param {object}   opts.githubConfig  — { token, owner, repo }
   */
  async init({ dataDir, projectRoot, generateFn, githubConfig } = {}) {
    if (this._initialized) return this;

    this._dataDir      = dataDir;
    this._projectRoot  = projectRoot;
    this._generateFn   = generateFn;
    this._githubConfig = githubConfig || {};

    // Modülleri başlat
    this.backlog   = new EngineeringBacklog(dataDir).init();
    this.planner   = new ImprovementPlanner(dataDir).init();
    this.scorecard = new EngineeringScorecard(dataDir).init();
    this.learning  = new LearningDatabase(dataDir).init();
    this.intel     = new CompetitiveIntel(dataDir).init();
    this.genome    = new CODEGAEG(dataDir).init();
    this.timeline  = new EngineeringTimeline(dataDir).init();
    // Mühendislik geçmişini (alpha.47→) yalnız bir kez tohumla; mevcut olaylara dokunmaz.
    try { this.timeline.seed(SEED_TIMELINE); } catch (_e) {}

    this.patcher = new PatchGenerator({
      projectRoot,
      dataDir,
      githubToken: this._githubConfig.token || "",
      owner      : this._githubConfig.owner || "",
      repo       : this._githubConfig.repo  || "",
      generateFn,
    });

    this._initialized = true;
    this.emit("ready");
    return this;
  }

  // ── Ana Döngü ────────────────────────────────────────────────────────────────

  /**
   * Tam otonom analiz döngüsü.
   * Açılışta + zamanlayıcıyla çalışır.
   * @param {object} evolutionReport  — EvolutionEngine.analyze() çıktısı
   * @param {string} version
   * @returns {AEPCycleResult}
   */
  async runCycle(evolutionReport, version) {
    if (this._analysisInProgress) return { skipped: true, reason: "Analiz zaten devam ediyor" };
    this._analysisInProgress = true;
    this.emit("cycle:start", { version });

    const result = {
      version,
      startedAt     : Date.now(),
      tasksAdded    : 0,
      proposalsAdded: 0,
      genomeSummary : null,
      completedAt   : null,
    };

    try {
      // 1. Evolution sonuçlarından backlog doldur
      const weaknesses = this._extractWeaknesses(evolutionReport);
      const addedTasks = this.backlog.addFromAnalysis(weaknesses);
      result.tasksAdded = addedTasks.length;
      this.emit("cycle:tasks", { count: addedTasks.length });

      // 2. Açık task'lardan öneri üret
      const openTasks = this.backlog.openTasks().slice(0, 10);
      const proposals = this.planner.planForTasks(openTasks);
      result.proposalsAdded = proposals.length;
      this.emit("cycle:proposals", { count: proposals.length });

      // 3. Skorkartı güncelle
      if (evolutionReport) {
        this.scorecard.recordFromEvolution(version, evolutionReport);
      }

      // 4. Genome üret
      result.genomeSummary = this.genome.generate({
        version,
        scorecard: this.scorecard.latest(),
        backlog  : this.backlog.summary(),
        learning : this.learning.summary(),
        evolution: evolutionReport,
      });
      this.emit("cycle:genome", result.genomeSummary);

      // 5. Rekabet analizi (her 10 döngüde bir)
      if (!this.intel.latest() || Date.now() - (this.intel.latest()?.analyzedAt || 0) > 7 * 24 * 3600 * 1000) {
        this.intel.analyze();
      }

    } catch (e) {
      console.error("[AEPOS] cycle error:", e.message);
      this.emit("cycle:error", { error: e.message });
    }

    this._analysisInProgress = false;
    result.completedAt = Date.now();
    this.emit("cycle:complete", result);
    return result;
  }

  /**
   * Onaylı öneri için patch döngüsü başlat.
   * @param {string} proposalId
   * @returns {Promise<PatchResult>}
   */
  async runPatch(proposalId) {
    const proposal = this.planner.get(proposalId);
    if (!proposal) throw new Error(`Öneri bulunamadı: ${proposalId}`);
    if (proposal.status !== PROPOSAL_STATUS.APPROVED) {
      throw new Error(`Öneri onaylanmadı: ${proposal.status}`);
    }

    const task = this.backlog.get(proposal.taskId);
    if (!task) throw new Error(`Task bulunamadı: ${proposal.taskId}`);

    this.emit("patch:start", { taskId: task.id, proposalId });
    this.planner.update(proposalId, { status: PROPOSAL_STATUS.IN_PATCH });

    const patchResult = await this.patcher.run(task, proposal);

    // Öğren
    this.learning.learnFromPatch(task, proposal, patchResult);

    if (patchResult.status === "pr_open") {
      this.backlog.update(task.id, { status: TASK_STATUS.PR_OPEN, prUrl: patchResult.prUrl });
      this.planner.update(proposalId, { status: PROPOSAL_STATUS.COMPLETED });
      this.emit("patch:pr_open", { prUrl: patchResult.prUrl, prNumber: patchResult.prNumber });
    } else {
      const isQaBlocked = patchResult.status === "qa_blocked";
      this.backlog.addNote(task.id, `Patch ${isQaBlocked ? "QA tarafından bloklandı" : "başarısız"}: ${patchResult.error}`);
      this.planner.update(proposalId, { status: PROPOSAL_STATUS.DRAFT });
      this.emit(isQaBlocked ? "patch:qa_blocked" : "patch:failed", { error: patchResult.error, qaReview: patchResult.qaReview });
    }

    return patchResult;
  }

  /** Öneri onayla */
  approveProposal(proposalId) {
    return this.planner.approve(proposalId);
  }

  /** Öneri reddet + öğren */
  rejectProposal(proposalId, reason) {
    const proposal = this.planner.get(proposalId);
    const task     = proposal ? this.backlog.get(proposal.taskId) : null;
    if (proposal && task) this.learning.learnFromRejectedPR(task, proposal, reason);
    return this.planner.reject(proposalId, reason);
  }

  /** PR merge sonrası task'ı kapat */
  closePRTask(taskId) {
    return this.backlog.update(taskId, { status: TASK_STATUS.RESOLVED });
  }

  // ── Evolution Report → Backlog Dönüşümü ─────────────────────────────────────

  _extractWeaknesses(report) {
    const weaknesses = [];
    if (!report) return weaknesses;

    const scores = report.scores || {};

    if ((scores.testCoverage || 0) < 40) {
      weaknesses.push({ title: "Test kapsaması yetersiz", category: CATEGORY.TEST_COVERAGE, severity: SEVERITY.HIGH, effort: "m", impact: 7 });
    }
    if ((scores.architecture || 0) < 60) {
      weaknesses.push({ title: "Mimari skor düşük", category: CATEGORY.ARCHITECTURE, severity: SEVERITY.MEDIUM, effort: "l", impact: 6 });
    }
    if ((scores.complexity || 0) < 50) {
      weaknesses.push({ title: "Yüksek kod karmaşıklığı", category: CATEGORY.TECH_DEBT, severity: SEVERITY.MEDIUM, effort: "m", impact: 5 });
    }
    if ((scores.maintainability || 0) < 50) {
      weaknesses.push({ title: "Düşük bakım kalitesi", category: CATEGORY.TECH_DEBT, severity: SEVERITY.MEDIUM, effort: "m", impact: 5 });
    }

    for (const item of (report.technicalDebt || []).slice(0, 5)) {
      weaknesses.push({
        title   : item.description || `Teknik borç: ${item.file || "bilinmiyor"}`,
        description: item.type ? `${item.type} — ${item.file || ""}` : "",
        category: CATEGORY.TECH_DEBT,
        severity: item.severity === "high" ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        effort  : "s",
        impact  : 4,
        modules : item.file ? [item.file] : [],
      });
    }

    return weaknesses;
  }

  // ── CTO Dashboard ─────────────────────────────────────────────────────────────

  /**
   * Tam CTO dashboard verisi döner.
   */
  dashboard() {
    return {
      timestamp  : Date.now(),
      backlog    : this.backlog?.summary()    || {},
      scorecard  : this.scorecard?.summary()  || {},
      planner    : this.planner?.summary()    || {},
      learning   : this.learning?.summary()   || {},
      intel      : this.intel?.summary()      || {},
      genome     : this.genome?.summary()     || {},
      timeline   : this.timeline?.summary()   || {},
      cegReport  : this.genome?.report()      || {},
      status     : {
        initialized     : this._initialized,
        analysisRunning : this._analysisInProgress,
        releaseDNAPasses: this.scorecard?.releasePassesDNARule() ?? null,
      },
    };
  }

  isInitialized() { return this._initialized; }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const aepOS = new AEPOS();

async function initAEPOS({ dataDir, projectRoot, generateFn, githubConfig } = {}) {
  return aepOS.init({ dataDir, projectRoot, generateFn, githubConfig });
}

module.exports = { AEPOS, aepOS, initAEPOS };
