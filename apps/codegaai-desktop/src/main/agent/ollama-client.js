"use strict";
/**
 * agent/ollama-client.js
 * -----------------------
 * Ollama HTTP `/api/chat` istemcisi.
 *
 * Eski mimari `ollama run model "prompt"` (CLI, tek-atış) kullanıyordu: ne
 * konuşma geçmişi, ne system mesajı, ne de araç döngüsü mümkündü. HTTP
 * `/api/chat` ise messages dizisi (system + history + user) alır; bu da ReAct
 * ajan döngüsünün temelidir.
 *
 * Ollama masaüstü kurulumu arka planda 127.0.0.1:11434'te servis verir.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

/**
 * Tek bir chat tamamlaması (bloklayıcı).
 * @param {string} model
 * @param {Array<{role:string,content:string}>} messages
 * @returns {Promise<string>} asistan metni
 */
async function ollamaChat(model, messages, opts = {}) {
  const {
    temperature = 0.4,
    timeoutMs = 90000,
    host = OLLAMA_HOST,
    numCtx = 8192,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature, num_ctx: numCtx },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }
    const data = await res.json();
    return (data && data.message && data.message.content) || "";
  } finally {
    clearTimeout(timer);
  }
}

/** Ollama HTTP servisi ayakta mı? */
async function ollamaReachable(host = OLLAMA_HOST, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch (_e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { ollamaChat, ollamaReachable, OLLAMA_HOST };
