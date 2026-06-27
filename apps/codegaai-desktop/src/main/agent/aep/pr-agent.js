"use strict";

/**
 * pr-agent.js — CODEGA AI Pull Request Ajan
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Her PR şunları içermeli:
 *   - Problem tanımı
 *   - Kök neden
 *   - Mimari etki
 *   - Değiştirilen dosyalar
 *   - Performans etkisi
 *   - Regresyon riski
 *   - Rollback planı
 *   - Test sonuçları
 *   - Release note taslağı
 *
 * KURAL: İnsan onayı olmadan ASLA merge edilmez.
 */

const { PROPOSAL_TYPE } = require("./improvement-planner");

// ── PR İçerik Üretici ─────────────────────────────────────────────────────────

/**
 * Review-ready PR açıklaması üret.
 * @param {object} opts
 * @param {object} opts.task       — EngineeringTask
 * @param {object} opts.proposal   — ImprovementProposal
 * @param {object} opts.patchResult — patch-generator sonucu
 * @returns {object} { title, body, labels }
 */
function generatePRContent({ task, proposal, patchResult = {} }) {
  const title = buildTitle(proposal);
  const body  = buildBody({ task, proposal, patchResult });
  const labels = buildLabels({ task, proposal });
  return { title, body, labels };
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function buildTitle(proposal) {
  const prefix = {
    [PROPOSAL_TYPE.BUG_FIX]       : "fix",
    [PROPOSAL_TYPE.REFACTOR]      : "refactor",
    [PROPOSAL_TYPE.TEST_ADDITION] : "test",
    [PROPOSAL_TYPE.PERF_OPT]      : "perf",
    [PROPOSAL_TYPE.SECURITY_PATCH]: "security",
    [PROPOSAL_TYPE.DOC_UPDATE]    : "docs",
    [PROPOSAL_TYPE.ARCH_REDESIGN] : "arch",
    [PROPOSAL_TYPE.DEPENDENCY_UPD]: "chore",
    [PROPOSAL_TYPE.FEATURE_ADD]   : "feat",
  }[proposal.type] || "chore";

  return `${prefix}: ${proposal.title}`;
}

function buildBody({ task, proposal, patchResult }) {
  const lines = [];

  lines.push("## Problem");
  lines.push(task.description || task.title);
  lines.push("");

  lines.push("## Kök Neden");
  lines.push(proposal.description || "_Otomatik analiz ile tespit edildi._");
  lines.push("");

  lines.push("## Uygulanan Çözüm");
  lines.push(proposal.implementation || "_Bkz: değiştirilen dosyalar_");
  lines.push("");

  lines.push("## Mimari Etki");
  if (proposal.affectedFiles?.length) {
    lines.push("Etkilenen modüller:");
    for (const f of proposal.affectedFiles) lines.push(`- \`${f}\``);
  } else {
    lines.push("_Sınırlı mimari etki bekleniyor._");
  }
  lines.push("");

  lines.push("## Değiştirilen Dosyalar");
  if (patchResult.changedFiles?.length) {
    for (const f of patchResult.changedFiles) lines.push(`- \`${f}\``);
  } else {
    lines.push("_Bkz: commits_");
  }
  lines.push("");

  lines.push("## Beklenen Etki");
  lines.push(proposal.expectedImpact || "_Etki tahmini yapılmadı._");
  lines.push(`**Etki Skoru:** ${proposal.impactScore}/10`);
  lines.push(`**ROI:** ${proposal.roi}`);
  lines.push("");

  lines.push("## Regresyon Riski");
  const riskLevel = proposal.regressionRisk >= 7 ? "🔴 YÜKSEK"
    : proposal.regressionRisk >= 4 ? "🟡 ORTA"
    : "🟢 DÜŞÜK";
  lines.push(`${riskLevel} (${proposal.regressionRisk}/10)`);
  lines.push("");

  lines.push("## Rollback Planı");
  lines.push(patchResult.rollbackPlan || `Bu branch'i revert et: \`git revert HEAD\``);
  lines.push("");

  lines.push("## Test Sonuçları");
  if (patchResult.testResults) {
    lines.push(`- **Toplam:** ${patchResult.testResults.total || "?"}`);
    lines.push(`- **Geçen:** ${patchResult.testResults.passed || "?"}`);
    lines.push(`- **Başarısız:** ${patchResult.testResults.failed || 0}`);
    if (patchResult.testResults.coverage !== undefined) {
      lines.push(`- **Kapsama:** %${patchResult.testResults.coverage}`);
    }
  } else {
    lines.push("_Test sonuçları henüz mevcut değil._");
  }
  lines.push("");

  lines.push("## Release Note Taslağı");
  lines.push(buildReleaseNote({ task, proposal }));
  lines.push("");

  lines.push("---");
  lines.push("> **⚠️ CODEGA AEP tarafından otomatik oluşturulmuştur.**");
  lines.push("> **İnsan onayı olmadan merge edilemez.**");
  lines.push(`> Task: \`${task.id}\` | Öneri: \`${proposal.id}\` | Ajan: \`${proposal.suggestedAgent}\``);

  return lines.join("\n");
}

function buildReleaseNote({ task, proposal }) {
  const verb = {
    [PROPOSAL_TYPE.BUG_FIX]       : "Düzeltildi",
    [PROPOSAL_TYPE.REFACTOR]      : "İyileştirildi",
    [PROPOSAL_TYPE.TEST_ADDITION] : "Test kapsaması genişletildi",
    [PROPOSAL_TYPE.PERF_OPT]      : "Performans optimize edildi",
    [PROPOSAL_TYPE.SECURITY_PATCH]: "Güvenlik açığı kapatıldı",
    [PROPOSAL_TYPE.DOC_UPDATE]    : "Dokümantasyon güncellendi",
    [PROPOSAL_TYPE.ARCH_REDESIGN] : "Mimari yeniden yapılandırıldı",
    [PROPOSAL_TYPE.FEATURE_ADD]   : "Yeni özellik eklendi",
  }[proposal.type] || "İyileştirildi";

  return `- ${verb}: ${task.title}`;
}

function buildLabels({ task, proposal }) {
  const labels = ["aep-auto"];

  if (proposal.type === PROPOSAL_TYPE.BUG_FIX)        labels.push("bug");
  if (proposal.type === PROPOSAL_TYPE.SECURITY_PATCH)  labels.push("security");
  if (proposal.type === PROPOSAL_TYPE.PERF_OPT)        labels.push("performance");
  if (proposal.type === PROPOSAL_TYPE.TEST_ADDITION)   labels.push("testing");
  if (proposal.type === PROPOSAL_TYPE.ARCH_REDESIGN)   labels.push("architecture");

  if (task.severity === "critical") labels.push("critical");
  if (task.severity === "high")     labels.push("high-priority");

  return labels;
}

// ── GitHub PR Gönderici ───────────────────────────────────────────────────────

/**
 * GitHub REST API ile PR oluştur.
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.head     — branch adı
 * @param {string} opts.base     — hedef branch (genellikle "main")
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string[]} opts.labels
 * @returns {Promise<{ url: string, number: number }>}
 */
async function createGitHubPR({ token, owner, repo, head, base = "main", title, body, labels = [] }) {
  const https = require("node:https");

  const prData = JSON.stringify({ title, body, head, base, draft: true });

  const prRes = await _httpsPost(`https://api.github.com/repos/${owner}/${repo}/pulls`, prData, token);
  if (prRes.errors || !prRes.number) {
    throw new Error(`PR oluşturulamadı: ${JSON.stringify(prRes.errors || prRes.message)}`);
  }

  // Label ata
  if (labels.length) {
    try {
      await _httpsPost(
        `https://api.github.com/repos/${owner}/${repo}/issues/${prRes.number}/labels`,
        JSON.stringify({ labels }),
        token
      );
    } catch (_) {}
  }

  return { url: prRes.html_url, number: prRes.number };
}

function _httpsPost(url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = require("node:https").request({
      hostname: u.hostname,
      path    : u.pathname,
      method  : "POST",
      headers : {
        "Authorization": `token ${token}`,
        "Content-Type" : "application/json",
        "User-Agent"   : "CODEGA-AEP/1.0",
        "Accept"       : "application/vnd.github.v3+json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  generatePRContent,
  createGitHubPR,
  buildTitle,
  buildBody,
  buildReleaseNote,
};
