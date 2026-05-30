"use strict";
/**
 * agent/self-improve.js
 * ----------------------
 * DENETİMLİ kendi-kendine geliştirme.
 *
 * Ajan bir iyileştirme ÖNERİSİNİ ayrı bir dal + Pull Request olarak hazırlar.
 * - ASLA main'e yazmaz, ASLA otomatik birleştirmez.
 * - PR içeriği bir NOT/öneri (markdown) — doğrudan çalışan kod değildir.
 * - İnsan inceler, CI testleri PR'da çalışır, onaylanırsa insan birleştirir.
 *
 * buildProposal/slugify saf; submitProposal git işlemlerini ENJEKTE alır → test edilebilir.
 */

function slugify(text) {
  return String(text || "oneri")
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "oneri";
}

/** Yapılandırılmış öneri metni üret (markdown). */
function buildProposal({ idea, rationale = "", observations = [], version = "" } = {}) {
  const title = String(idea || "").trim().split("\n")[0].slice(0, 80) || "İyileştirme önerisi";
  const slug = slugify(title);
  const lines = [
    `# Öneri: ${title}`,
    "",
    "> Bu bir **öneridir**, doğrudan çalışan kod değildir. İnceleyip uygun görürsen sen uygula/birleştir.",
    "",
    "## Amaç / Gerekçe",
    rationale.trim() || String(idea || "").trim() || "(belirtilmedi)",
    "",
  ];
  if (observations.length) {
    lines.push("## Gözlemler", ...observations.map((o) => `- ${o}`), "");
  }
  lines.push(
    "## Notlar",
    `- Kaynak: CODEGA AI kendi-kendine geliştirme${version ? ` (sürüm ${version})` : ""}`,
    "- Bu PR otomatik birleştirilmez; onay senindir.",
    ""
  );
  return { title, slug, body: lines.join("\n") };
}

/**
 * Öneriyi ayrı dal + PR olarak gönder.
 * @param {object} git  github-client benzeri: splitRepo,getRepoMeta,getBranchSha,createBranch,createFileOnBranch,openPullRequest
 * @param {string} ownerRepo  "owner/repo"
 * @param {object} proposal  buildProposal çıktısı
 * @param {number} now
 */
async function submitProposal(git, ownerRepo, proposal, now = Date.now()) {
  const { owner, repo } = git.splitRepo(ownerRepo);
  const meta = await git.getRepoMeta(owner, repo);
  const base = (meta && meta.default_branch) || "main";
  const baseSha = await git.getBranchSha(owner, repo, base);
  if (!baseSha) throw new Error(`Taban dal SHA bulunamadı (${base}).`);

  const branch = `codega-oneri/${proposal.slug}-${now}`;
  await git.createBranch(owner, repo, branch, baseSha);

  const filePath = `proposals/${proposal.slug}-${now}.md`;
  await git.createFileOnBranch(owner, repo, filePath, branch, proposal.body, `CODEGA AI önerisi: ${proposal.title}`);

  const pr = await git.openPullRequest(
    owner,
    repo,
    branch,
    base,
    `CODEGA AI önerisi: ${proposal.title}`,
    proposal.body
  );
  return { url: (pr && pr.html_url) || "", number: pr && pr.number, branch, base, filePath };
}

module.exports = { slugify, buildProposal, submitProposal };
