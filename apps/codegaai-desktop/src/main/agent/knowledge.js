"use strict";
/**
 * agent/knowledge.js
 * -------------------
 * Öğrenilenleri AYRI bir GitHub bilgi dosyasına (JSONL) yazar ve oradan okur.
 * "Öğrendiğini GitHub'a kaydet, sonra oradan oku" isteğinin güvenli karşılığı:
 * üretim kodu değil, append-only NOT kaydı.
 */

const { getSettings } = require("./settings-store");
const gh = require("./github-client");
const memory = require("./memory");

function parseFactText(line) {
  try {
    const o = JSON.parse(line);
    return o.text || "";
  } catch (_e) {
    return String(line || "").trim();
  }
}

function config() {
  const s = getSettings();
  if (!s.knowledgeRepo || !gh.hasToken()) return null;
  let parsed;
  try {
    parsed = gh.splitRepo(s.knowledgeRepo);
  } catch (_e) {
    return null;
  }
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    branch: s.knowledgeBranch || "main",
    path: s.knowledgePath || "knowledge/codega-learnings.jsonl",
  };
}

/** Yerel bellekteki yeni gerçekleri GitHub bilgi dosyasına ekle. */
async function syncUp() {
  const c = config();
  if (!c) return { ok: false, reason: "GitHub bilgi reposu/token yapılandırılmadı." };
  const local = memory.listFacts();
  if (!local.length) return { ok: true, added: 0 };
  const remote = await gh.readKnowledgeFile(c.owner, c.repo, c.path, c.branch);
  const remoteSet = new Set(remote.map(parseFactText));
  const toAdd = local
    .filter((f) => !remoteSet.has(f))
    .map((f) => JSON.stringify({ text: f, at: Date.now() }));
  if (!toAdd.length) return { ok: true, added: 0 };
  const n = await gh.appendToFile(
    c.owner, c.repo, c.path, c.branch, toAdd,
    `CODEGA AI: ${toAdd.length} yeni bilgi`
  );
  return { ok: true, added: n };
}

/** GitHub bilgi dosyasını okuyup yerel belleğe yükle. */
async function syncDown() {
  const c = config();
  if (!c) return { ok: false, reason: "GitHub bilgi reposu/token yapılandırılmadı." };
  const remote = await gh.readKnowledgeFile(c.owner, c.repo, c.path, c.branch);
  let loaded = 0;
  for (const line of remote) {
    const text = parseFactText(line);
    if (text) {
      memory.remember(text);
      loaded += 1;
    }
  }
  return { ok: true, loaded };
}

function isConfigured() {
  return !!config();
}

module.exports = { syncUp, syncDown, isConfigured, parseFactText };
