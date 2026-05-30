"use strict";
/**
 * agent/openai-client.js
 * -----------------------
 * OpenAI-UYUMLU bulut sağlayıcı istemcisi. OpenAI, OpenRouter, Deepseek, Groq,
 * Together, yerel LM Studio vb. hepsi `/chat/completions` formatını destekler.
 *
 * API anahtarı YALNIZCA kullanıcının kendi cihazında (ayarlarda) saklanır ve
 * yalnızca kullanıcının seçtiği baseUrl'e gönderilir. Anahtar loglanmaz.
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function endpoint(baseUrl) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

/** Bloklayıcı tamamlama. */
async function openaiChat(messages, opts = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL,
    apiKey = "",
    model = "gpt-4o-mini",
    temperature = 0.4,
    timeoutMs = 90000,
  } = opts;
  if (!apiKey) throw new Error("API anahtarı yok.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Sağlayıcı HTTP ${res.status}${t ? ` — ${t.slice(0, 120)}` : ""}`);
    }
    const data = await res.json();
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  } finally {
    clearTimeout(timer);
  }
}

/** Akışlı (SSE) tamamlama. Token geldikçe onToken(token); tüm metni döndürür. */
async function openaiChatStream(messages, opts = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL,
    apiKey = "",
    model = "gpt-4o-mini",
    temperature = 0.4,
    timeoutMs = 120000,
    onToken = null,
  } = opts;
  if (!apiKey) throw new Error("API anahtarı yok.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let full = "";
  try {
    const res = await fetch(endpoint(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, stream: true }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const t = res.body ? "" : " (gövde yok)";
      throw new Error(`Sağlayıcı HTTP ${res.status}${t}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return full;
        try {
          const obj = JSON.parse(payload);
          const tok = obj && obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
          if (tok) {
            full += tok;
            if (onToken) { try { onToken(tok); } catch (_e) { /* yut */ } }
          }
        } catch (_e) { /* yarım satır olabilir */ }
      }
    }
    return full;
  } finally {
    clearTimeout(timer);
  }
}

/** Bağlantı testi: kısa bir tamamlama dener. {ok, message} döner. */
async function openaiTest(opts = {}) {
  try {
    const txt = await openaiChat(
      [{ role: "user", content: "ping" }],
      { ...opts, timeoutMs: 15000 }
    );
    return { ok: true, message: txt ? "Bağlantı başarılı." : "Bağlandı ama boş yanıt geldi." };
  } catch (e) {
    return { ok: false, message: (e && e.message) || "Bağlantı başarısız." };
  }
}

module.exports = { openaiChat, openaiChatStream, openaiTest, DEFAULT_BASE_URL };
