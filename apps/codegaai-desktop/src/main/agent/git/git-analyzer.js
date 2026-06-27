"use strict";

/**
 * GitAnalyzer — Diff ve commit geçmişini analiz ederek AI-ready çıktı üretir.
 *
 * Özellikler:
 *   - Conventional Commits formatında commit mesajı önerisi
 *   - Branch adı önerisi (feature/, fix/, chore/ vb.)
 *   - Release notes üretimi (tag'ler arasındaki commit'lerden)
 *   - Changelog üretimi (Keep a Changelog formatı)
 *   - Merge conflict açıklaması
 */

const git = require("./git-engine");

// Conventional Commits türleri
const COMMIT_TYPES = [
  { type: "feat",     desc: "yeni özellik",          emoji: "✨" },
  { type: "fix",      desc: "hata düzeltmesi",        emoji: "🐛" },
  { type: "docs",     desc: "dokümantasyon",           emoji: "📝" },
  { type: "style",    desc: "biçimlendirme",           emoji: "💄" },
  { type: "refactor", desc: "yeniden yapılandırma",    emoji: "♻️"  },
  { type: "perf",     desc: "performans iyileştirme",  emoji: "⚡"  },
  { type: "test",     desc: "test ekleme/düzeltme",    emoji: "✅" },
  { type: "build",    desc: "derleme/bağımlılık",      emoji: "📦" },
  { type: "ci",       desc: "CI/CD",                   emoji: "🔧" },
  { type: "chore",    desc: "rutin görev",             emoji: "🔨" },
  { type: "revert",   desc: "geri alma",               emoji: "⏪" },
  { type: "security", desc: "güvenlik düzeltmesi",     emoji: "🔒" },
];

// Diff içeriğine bakarak commit türünü tahmin eder
function guessCommitType(diff, statusFiles) {
  const lower = (diff || "").toLowerCase();
  const files = statusFiles.map((f) => f.file.toLowerCase());

  if (files.some((f) => f.includes("test") || f.includes("spec"))) return "test";
  if (files.some((f) => f.endsWith(".md") || f.includes("docs/"))) return "docs";
  if (files.some((f) => f.includes(".github/") || f.includes("ci") || f.endsWith(".yml"))) return "ci";
  if (lower.includes("security") || lower.includes("vulnerability") || lower.includes("cve")) return "security";
  if (lower.includes("fix") || lower.includes("bug") || lower.includes("error") || lower.includes("crash")) return "fix";
  if (lower.includes("performance") || lower.includes("optim") || lower.includes("cache")) return "perf";
  if (lower.includes("refactor") || lower.includes("rename") || lower.includes("restructur")) return "refactor";
  if (lower.includes("style") || lower.includes("format") || lower.includes("lint")) return "style";
  return "feat";
}

// Değişen dosyalardan scope tahmin eder
function guessScope(statusFiles) {
  if (!statusFiles.length) return "";
  const dirs = statusFiles.map((f) => {
    const parts = f.file.split("/");
    return parts.length > 1 ? parts[0] : "";
  }).filter(Boolean);

  if (!dirs.length) return "";
  const counts = {};
  for (const d of dirs) counts[d] = (counts[d] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= dirs.length * 0.5) return top[0];
  return "";
}

/**
 * Staged diff'ten Conventional Commits formatında commit mesajı önerir.
 * @param {string} repoPath
 * @returns {Promise<object>}
 */
async function suggestCommitMessage(repoPath) {
  const [diff, files, summary] = await Promise.all([
    git.diffStaged(repoPath).catch(() => ""),
    git.status(repoPath).catch(() => []),
    git.diffSummary(repoPath).catch(() => ({ raw: "", summary: "" })),
  ]);

  const stagedFiles = files.filter((f) => f.staged);

  if (!stagedFiles.length) {
    return {
      ok: false,
      message: "Staged değişiklik yok. Önce `git add` ile dosyaları stage'leyin.",
    };
  }

  const type = guessCommitType(diff, stagedFiles);
  const scope = guessScope(stagedFiles);
  const typeInfo = COMMIT_TYPES.find((t) => t.type === type) || COMMIT_TYPES[0];

  // Değişen dosyaları özetle
  const fileList = stagedFiles.map((f) => `  ${f.status} ${f.file}`).join("\n");
  const firstFile = stagedFiles[0]?.file || "";
  const baseName = firstFile.split("/").pop()?.replace(/\.[^.]+$/, "") || "code";

  const scopePart = scope ? `(${scope})` : "";
  const suggested = `${type}${scopePart}: ${baseName} düzenlendi`;

  return {
    ok: true,
    type,
    scope,
    emoji: typeInfo.emoji,
    suggested,
    alternatives: COMMIT_TYPES
      .filter((t) => t.type !== type)
      .slice(0, 4)
      .map((t) => `${t.type}${scopePart}: ${baseName} ${t.desc}`),
    stagedFiles: stagedFiles.length,
    diffSummary: summary.summary,
    fileList,
    template: `${type}${scopePart}: <kısa açıklama>\n\n<isteğe bağlı gövde>\n\n<isteğe bağlı footer: Closes #123>`,
  };
}

/**
 * Görev açıklamasından branch adı önerir.
 * @param {string} description - "kullanıcı girişi düzelt" gibi serbest metin
 * @param {string} type - feat|fix|chore vb.
 */
function suggestBranchName(description, type = "feat") {
  const slug = description
    .toLowerCase()
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  const prefix = type === "fix" ? "fix/" : type === "chore" ? "chore/" : "feat/";
  const dateSuffix = new Date().toISOString().slice(0, 10);

  return {
    primary: `${prefix}${slug}`,
    withDate: `${prefix}${dateSuffix}-${slug}`,
    short: `${prefix}${slug.split("-").slice(0, 3).join("-")}`,
  };
}

/**
 * İki tag arasındaki commit'lerden release notes üretir.
 * @param {string} repoPath
 * @param {string} fromTag - önceki tag (boş ise tüm geçmiş)
 * @param {string} toRef   - hedef ref (varsayılan: HEAD)
 * @param {string} version - yeni versiyon adı
 */
async function generateReleaseNotes(repoPath, fromTag = "", toRef = "HEAD", version = "") {
  const commits = await git.commitsBetween(repoPath, fromTag, toRef);
  const branch = await git.currentBranch(repoPath);
  const remote = await git.remoteUrl(repoPath).catch(() => "");
  const repoUrl = remote.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/");
  const date = new Date().toISOString().slice(0, 10);
  const versionTitle = version || "Unreleased";

  // Kategorize et
  const categories = {
    "✨ Yeni Özellikler": [],
    "🐛 Hata Düzeltmeleri": [],
    "⚡ Performans": [],
    "🔒 Güvenlik": [],
    "♻️ Yeniden Yapılandırma": [],
    "📝 Dokümantasyon": [],
    "🔧 CI/CD ve Altyapı": [],
    "📦 Bağımlılıklar": [],
    "🔨 Diğer": [],
  };

  for (const c of commits) {
    const s = c.subject.toLowerCase();
    const sha = repoUrl ? `[\`${c.sha}\`](${repoUrl}/commit/${c.sha})` : `\`${c.sha}\``;
    const line = `- ${c.subject} (${sha})`;
    if (s.startsWith("feat")) categories["✨ Yeni Özellikler"].push(line);
    else if (s.startsWith("fix")) categories["🐛 Hata Düzeltmeleri"].push(line);
    else if (s.startsWith("perf")) categories["⚡ Performans"].push(line);
    else if (s.startsWith("security")) categories["🔒 Güvenlik"].push(line);
    else if (s.startsWith("refactor")) categories["♻️ Yeniden Yapılandırma"].push(line);
    else if (s.startsWith("docs")) categories["📝 Dokümantasyon"].push(line);
    else if (s.startsWith("ci") || s.startsWith("build")) categories["🔧 CI/CD ve Altyapı"].push(line);
    else if (s.startsWith("chore") && s.includes("dep")) categories["📦 Bağımlılıklar"].push(line);
    else categories["🔨 Diğer"].push(line);
  }

  const lines = [`## ${versionTitle} (${date})`, "", `**Branch:** \`${branch}\``, ""];
  for (const [cat, items] of Object.entries(categories)) {
    if (items.length) {
      lines.push(`### ${cat}`, "", ...items, "");
    }
  }
  if (!commits.length) lines.push("_Bu sürümde commit bulunamadı._", "");

  return {
    markdown: lines.join("\n"),
    commitCount: commits.length,
    categories: Object.fromEntries(
      Object.entries(categories).filter(([, v]) => v.length).map(([k, v]) => [k, v.length])
    ),
  };
}

/**
 * Keep a Changelog formatında CHANGELOG.md içeriği üretir.
 * @param {string} repoPath
 * @param {number} maxTags - kaç tag'e kadar geriye gidilecek
 */
async function generateChangelog(repoPath, maxTags = 10) {
  const allTags = (await git.tags(repoPath).catch(() => [])).slice(0, maxTags);
  const lines = [
    "# Changelog",
    "",
    "Bu dosya [Keep a Changelog](https://keepachangelog.com) standardına göre tutulmaktadır.",
    "",
  ];

  for (let i = 0; i < allTags.length; i++) {
    const to = allTags[i];
    const from = allTags[i + 1] || "";
    const notes = await generateReleaseNotes(repoPath, from, to, to).catch(() => null);
    if (notes) lines.push(notes.markdown);
  }

  // Unreleased section
  const latestTag = allTags[0] || "";
  const unreleased = await generateReleaseNotes(repoPath, latestTag, "HEAD", "Unreleased").catch(() => null);
  if (unreleased?.commitCount) {
    lines.unshift("", unreleased.markdown);
    lines.unshift("# Changelog", "");
  }

  return lines.join("\n");
}

/**
 * Merge conflict'i açıklar ve çözüm önerir.
 * @param {string} conflictBlock - <<<<<<< ... >>>>>>> bloğu
 */
function explainConflict(conflictBlock) {
  const oursMatch = conflictBlock.match(/<<<<<<< .+?\n([\s\S]*?)\n=======/);
  const theirsMatch = conflictBlock.match(/=======\n([\s\S]*?)\n>>>>>>> /);

  const ours = oursMatch?.[1]?.trim() || "(boş)";
  const theirs = theirsMatch?.[1]?.trim() || "(boş)";

  return {
    ours,
    theirs,
    explanation: [
      "**Çakışma açıklaması:**",
      `- **Bizim değişikliğimiz (HEAD):** \`${ours.slice(0, 120)}${ours.length > 120 ? "..." : ""}\``,
      `- **Gelen değişiklik (merge):** \`${theirs.slice(0, 120)}${theirs.length > 120 ? "..." : ""}\``,
      "",
      "**Çözüm seçenekleri:**",
      "1. Bizim versiyonumuzu koru → `<<<<<<` ile `=======` arasını bırak, kalanı sil",
      "2. Gelen versiyonu kabul et → `=======` ile `>>>>>>>` arasını bırak, kalanı sil",
      "3. İkisini birleştir → her iki bloğu mantıklı şekilde birleştir",
      "4. Tamamen yeniden yaz → her iki bloğu sil, doğru kodu yaz",
    ].join("\n"),
  };
}

module.exports = {
  suggestCommitMessage,
  suggestBranchName,
  generateReleaseNotes,
  generateChangelog,
  explainConflict,
};
