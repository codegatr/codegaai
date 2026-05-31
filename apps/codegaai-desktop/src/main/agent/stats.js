"use strict";
/**
 * agent/stats.js
 * ---------------
 * Gerçek kullanım sayaçları (demo değil). Her sohbet turunda record() ile artar.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

function storePath() {
  return process.env.CODEGA_STATS_PATH || path.join(os.homedir(), ".codega-stats.json");
}

function _empty() {
  return { total: 0, days: {}, tokens: {}, msSum: 0, msCount: 0, models: {}, agents: {} };
}
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return Object.assign(_empty(), d);
  } catch (_e) {
    return _empty();
  }
}
function save(d) {
  try { fs.writeFileSync(storePath(), JSON.stringify(d)); } catch (_e) {}
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function topKey(obj) {
  let best = null;
  let max = -1;
  for (const k of Object.keys(obj || {})) {
    if (obj[k] > max) { max = obj[k]; best = k; }
  }
  return best;
}

/** Bir tur kaydet. { model, agent, tokens, ms } */
function record(info = {}) {
  const d = load();
  const day = today();
  d.total += 1;
  d.days[day] = (d.days[day] || 0) + 1;
  const tok = Math.max(0, Math.round(Number(info.tokens) || 0));
  if (tok) d.tokens[day] = (d.tokens[day] || 0) + tok;
  if (Number(info.ms) > 0) { d.msSum += Number(info.ms); d.msCount += 1; }
  if (info.model) d.models[info.model] = (d.models[info.model] || 0) + 1;
  if (info.agent) d.agents[info.agent] = (d.agents[info.agent] || 0) + 1;
  // eski günleri buda (son 60 gün)
  const days = Object.keys(d.days).sort();
  if (days.length > 60) for (const old of days.slice(0, days.length - 60)) { delete d.days[old]; delete d.tokens[old]; }
  save(d);
  return d;
}

function summary() {
  const d = load();
  const day = today();
  const avgMs = d.msCount ? Math.round(d.msSum / d.msCount) : 0;
  return {
    total: d.total,
    today: d.days[day] || 0,
    tokensToday: d.tokens[day] || 0,
    avgSeconds: avgMs ? +(avgMs / 1000).toFixed(1) : 0,
    topModel: topKey(d.models),
    topAgent: topKey(d.agents),
  };
}

function clearAll() { save(_empty()); }

module.exports = { record, summary, clearAll, storePath };
