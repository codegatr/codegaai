"use strict";
/**
 * agent/learning.js
 * ------------------
 * Sürekli öğrenme kaynak çekicileri: GitHub + Web (DuckDuckGo) + Wikipedia.
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

/** Bir konu için 3 kaynaktan da bilgi topla (her biri korumalı). */
async function fetchKnowledge(topic, opts = {}) {
  const t = String(topic || "").trim();
  if (!t) return [];
  const token = opts.token || "";
  const results = await Promise.allSettled([wikipedia(t, opts.lang || "tr"), duckduckgo(t), github(t, token)]);
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

module.exports = { fetchKnowledge, wikipedia, duckduckgo, github, buildDistillMessages };
