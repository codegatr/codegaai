"use strict";
/**
 * agent/learning.js
 * ------------------
 * Sürekli öğrenme kaynak çekicileri: GitHub + Web (DuckDuckGo) + Wikipedia
 * + Stack Overflow + arXiv + Hacker News + MDN.
 * Bir konu için bu kaynaklardan kısa, kaynaklı bilgi notları toplar.
 *
 * NOT: Google'ın ücretsiz/anahtarsız resmi API'si yoktur; genel web için
 * DuckDuckGo Anlık Yanıt kullanılır. Her çekici ayrı try ile korunur; biri
 * patlarsa diğerleri çalışır.
 */

async function getJson(url, headers = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "CODEGA-AI", ...headers }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getText(url, headers = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { headers: { "User-Agent": "CODEGA-AI", ...headers }, signal: controller.signal })
    .then((res) => (res.ok ? res.text() : null))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

async function wikipedia(topic, lang = "tr") {
  const search = await getJson(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=1`
  );
  const hit = search && search.query && search.query.search && search.query.search[0];
  if (!hit) return null;
  const sum = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`);
  if (!sum || !sum.extract) return null;
  return {
    source: "wikipedia",
    topic,
    text: String(sum.extract).slice(0, 700),
    url: (sum.content_urls && sum.content_urls.desktop && sum.content_urls.desktop.page) || "",
  };
}

async function duckduckgo(topic) {
  const data = await getJson(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_html=1&skip_disambig=1`
  );
  if (!data) return null;
  let text = data.AbstractText || "";
  if (!text && Array.isArray(data.RelatedTopics)) {
    const first = data.RelatedTopics.find((t) => t && t.Text);
    if (first) text = first.Text;
  }
  if (!text) return null;
  return { source: "web", topic, text: String(text).slice(0, 700), url: data.AbstractURL || "" };
}

async function github(topic, token = "") {
  const headers = token ? { Authorization: `token ${token}` } : {};
  const data = await getJson(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=2`,
    headers
  );
  const items = (data && data.items) || [];
  if (!items.length) return null;
  const text = items
    .map((r) => `${r.full_name} (★${r.stargazers_count}): ${r.description || "açıklama yok"}`)
    .join("\n");
  return { source: "github", topic, text: text.slice(0, 700), url: items[0].html_url };
}

async function stackoverflow(topic) {
  const data = await getJson(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=2&q=${encodeURIComponent(topic)}&filter=default`
  );
  const items = (data && data.items) || [];
  if (!items.length) return null;
  const text = items
    .map((q) => `${q.title || "Soru"} (score ${q.score || 0}, cevap ${q.answer_count || 0})`)
    .join("\n");
  return { source: "stackoverflow", topic, text: stripTags(text).slice(0, 700), url: items[0].link || "" };
}

async function arxiv(topic) {
  const xml = await getText(
    `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(topic)}&start=0&max_results=1`
  );
  if (!xml) return null;
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i);
  if (!entry) return null;
  const title = stripTags((entry[1].match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const summary = stripTags((entry[1].match(/<summary>([\s\S]*?)<\/summary>/i) || [])[1] || "");
  const id = stripTags((entry[1].match(/<id>([\s\S]*?)<\/id>/i) || [])[1] || "");
  if (!title && !summary) return null;
  return { source: "arxiv", topic, text: `${title}. ${summary}`.slice(0, 700), url: id };
}

async function hackernews(topic) {
  const data = await getJson(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=2`
  );
  const hits = (data && data.hits) || [];
  if (!hits.length) return null;
  const text = hits
    .map((h) => `${h.title || h.story_title || "Haber"} (${h.points || 0} puan): ${h.url || h.story_url || ""}`)
    .join("\n");
  const first = hits[0];
  return { source: "hackernews", topic, text: text.slice(0, 700), url: first.url || first.story_url || `https://news.ycombinator.com/item?id=${first.objectID}` };
}

async function mdn(topic) {
  const data = await getJson(`https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(topic)}&locale=en-US`);
  const docs = (data && data.documents) || [];
  const hit = docs.find((d) => d && (d.summary || d.title));
  if (!hit) return null;
  const url = hit.mdn_url ? `https://developer.mozilla.org${hit.mdn_url}` : "";
  return { source: "mdn", topic, text: `${hit.title || "MDN"}. ${hit.summary || ""}`.slice(0, 700), url };
}

const FETCHERS = {
  wikipedia: (topic, opts) => wikipedia(topic, opts.lang || "tr"),
  web: (topic) => duckduckgo(topic),
  github: (topic, opts) => github(topic, opts.token || ""),
  stackoverflow: (topic) => stackoverflow(topic),
  arxiv: (topic) => arxiv(topic),
  hackernews: (topic) => hackernews(topic),
  mdn: (topic) => mdn(topic),
};

const DEFAULT_SOURCES = Object.keys(FETCHERS);

function normalizeSources(sources) {
  if (Array.isArray(sources)) return sources.map((s) => String(s).trim().toLowerCase()).filter((s) => FETCHERS[s]);
  if (typeof sources === "string" && sources.trim()) {
    return sources.split(",").map((s) => s.trim().toLowerCase()).filter((s) => FETCHERS[s]);
  }
  return DEFAULT_SOURCES;
}

/** Bir konu için seçili kaynaklardan bilgi topla (her biri korumalı). */
async function fetchKnowledge(topic, opts = {}) {
  const t = String(topic || "").trim();
  if (!t) return [];
  const selected = normalizeSources(opts.sources);
  const results = await Promise.allSettled(selected.map((name) => FETCHERS[name](t, opts)));
  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => ({ ...r.value, at: Date.now() }));
}

/** Damıtım için model mesajları (saf — test edilebilir). */
function buildDistillMessages(topic, notesText) {
  return [
    {
      role: "system",
      content:
        "Sen bir bilgi damıtıcısın. Verilen kaynak notlarını TÜRKÇE, en fazla 2 kısa cümlede, " +
        "yalnızca olgulara dayalı kalıcı bir bilgiye indir. Yorum katma, uydurma yapma. Sadece özet metnini yaz.",
    },
    {
      role: "user",
      content: `Konu: ${topic}\n\nKaynak notlar:\n${String(notesText || "").slice(0, 2000)}\n\nKısa kalıcı özet:`,
    },
  ];
}

module.exports = {
  fetchKnowledge,
  wikipedia,
  duckduckgo,
  github,
  stackoverflow,
  arxiv,
  hackernews,
  mdn,
  normalizeSources,
  DEFAULT_SOURCES,
  buildDistillMessages,
};
