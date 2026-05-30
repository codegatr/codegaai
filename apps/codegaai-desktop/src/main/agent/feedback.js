"use strict";
/**
 * agent/feedback.js
 * ------------------
 * Cevaplara 👍/👎 geri bildirimi. Sayaçları kalıcı tutar.
 * Olumsuz geri bildirim, kendini-geliştirme sinyaline dönüşmek üzere ayrıca
 * (main.js'te) improve-drafts'a iletilir → ajan bunu öneri taslağı yapar.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

function storePath() {
  if (process.env.CODEGA_FEEDBACK_PATH) return process.env.CODEGA_FEEDBACK_PATH;
  return path.join(os.homedir(), ".codega-feedback.json");
}

function load() {
  try {
    return { up: 0, down: 0, ...(JSON.parse(fs.readFileSync(storePath(), "utf8")) || {}) };
  } catch (_e) {
    return { up: 0, down: 0 };
  }
}
function save(data) {
  try { fs.writeFileSync(storePath(), JSON.stringify(data, null, 2)); } catch (_e) {}
}

function record({ rating, text = "", prompt = "" } = {}) {
  const data = load();
  if (rating === "up") data.up = (data.up || 0) + 1;
  else if (rating === "down") {
    data.down = (data.down || 0) + 1;
    data.lastDown = { text: String(text).slice(0, 200), prompt: String(prompt).slice(0, 200), at: Date.now() };
  }
  save(data);
  return data;
}

function stats() { return load(); }

module.exports = { record, stats, storePath };
