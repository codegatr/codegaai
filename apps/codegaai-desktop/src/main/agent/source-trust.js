"use strict";

const REUSE_LICENSES = new Set(["apache-2.0", "bsd-2-clause", "bsd-3-clause", "isc", "mit"]);

const SOURCE_RULES = Object.freeze({
  "anthropics/claude-code": Object.freeze({
    trust: "official",
    mode: "official-reference",
    label: "Resmi Anthropic kaynagi",
    contentPolicy: "principles-only",
    reason: "Anthropic'in resmi Claude Code deposu. Surumler ve mimari ilkeler izlenir; tescilli kaynak kod kopyalanmaz.",
  }),
  "vila-lab/dive-into-claude-code": Object.freeze({
    trust: "research",
    mode: "research-only",
    label: "Bagimsiz akademik analiz",
    contentPolicy: "research-only",
    reason: "Claude Code mimarisini inceleyen bagimsiz bir arastirma deposu. Atifli mimari arastirma icindir; urun kodu kaynagi degildir.",
  }),
  "tanbiralam/claude-code": Object.freeze({
    trust: "blocked",
    mode: "blocked",
    label: "Engelli kaynak",
    contentPolicy: "metadata-only",
    reason: "Depo kendisini sizdirilmis kaynak olarak tanimliyor ve kullanilabilir bir lisans sunmuyor. Icerigi ogrenilmez, kopyalanmaz veya benimsenmez.",
  }),
});

function normalizeRepo(repo) {
  return String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "").toLowerCase();
}

function licensePolicy(spdxId) {
  const id = String(spdxId || "").trim().toLowerCase();
  if (REUSE_LICENSES.has(id)) {
    return {
      trust: "licensed-community",
      mode: "reviewable-reuse",
      label: "Lisans incelemesiyle kullanilabilir",
      contentPolicy: "review-required",
      reason: "Izin verici lisans algilandi; yine de guvenlik, sahiplik ve uyumluluk incelemesi gerekir.",
    };
  }
  return {
    trust: "unverified",
    mode: "research-only",
    label: "Yalniz mimari arastirma",
    contentPolicy: "research-only",
    reason: "Yeniden kullanim icin acik ve izin verici bir lisans dogrulanamadi.",
  };
}

function sourcePolicy(repo, spdxId) {
  const known = SOURCE_RULES[normalizeRepo(repo)];
  return known ? { ...known } : licensePolicy(spdxId);
}

function canLearnFrom(policy) {
  return !!policy && policy.mode !== "blocked";
}

function canReuseCode(policy) {
  return !!policy && policy.mode === "reviewable-reuse";
}

module.exports = {
  REUSE_LICENSES,
  SOURCE_RULES,
  canLearnFrom,
  canReuseCode,
  licensePolicy,
  normalizeRepo,
  sourcePolicy,
};
