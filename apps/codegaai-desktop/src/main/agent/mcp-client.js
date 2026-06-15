"use strict";
/**
 * agent/mcp-client.js
 * --------------------
 * Minimal MCP (Model Context Protocol) istemcisi — JSON-RPC 2.0, HTTP taşıma.
 * Harici bir araç sunucusuna bağlanır, araçlarını listeler ve çağırır.
 *
 * GÜVENLİK/kapsam: Bu katman ajanın OTONOM araç döngüsüne BAĞLI DEĞİL. Yalnızca
 * kullanıcı opt-in bir sunucu URL'si tanımlayıp manuel listeler/çağırır. Mevcut
 * yerel araçlar (web_search vb.) etkilenmez.
 *
 * Yanıt application/json ya da text/event-stream (SSE) olabilir; ikisi de işlenir.
 */

const PROTOCOL_VERSION = "2025-03-26";
let _id = 0;

function parseBody(contentType, text) {
  // SSE ise data: satırlarından JSON-RPC nesnesini çıkar
  if (contentType.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload);
        if (obj && (obj.result !== undefined || obj.error !== undefined)) return obj;
      } catch (_e) { /* devam */ }
    }
    return null;
  }
  try { return JSON.parse(text); } catch (_e) { return null; }
}

async function rpc(url, method, params, opts = {}) {
  const { sessionId = "", notification = false, timeoutMs = 20000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const body = { jsonrpc: "2.0", method };
  if (params !== undefined) body.params = params;
  if (!notification) body.id = ++_id;

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const newSession = res.headers.get("mcp-session-id") || sessionId;
    if (notification) return { ok: res.ok, sessionId: newSession, result: null };
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`MCP HTTP ${res.status}${t ? ` — ${t.slice(0, 120)}` : ""}`);
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    const obj = parseBody(ct, text);
    if (!obj) throw new Error("MCP yanıtı çözümlenemedi.");
    if (obj.error) throw new Error(`MCP hata: ${obj.error.message || JSON.stringify(obj.error)}`);
    return { ok: true, sessionId: newSession, result: obj.result };
  } finally {
    clearTimeout(timer);
  }
}

/** initialize + initialized bildirimi; oturum kimliği döner. */
async function connect(url) {
  const init = await rpc(url, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "CODEGA AI", version: "1.0" },
  });
  const sessionId = init.sessionId;
  // initialized bildirimi (hatası kritik değil)
  try { await rpc(url, "notifications/initialized", undefined, { sessionId, notification: true }); } catch (_e) {}
  return { sessionId, serverInfo: init.result && init.result.serverInfo };
}

/** Araçları listele: [{name, description, inputSchema}] */
async function listTools(url) {
  const { sessionId, serverInfo } = await connect(url);
  const r = await rpc(url, "tools/list", {}, { sessionId });
  const tools = (r.result && r.result.tools) || [];
  return { serverInfo, tools };
}

/** Bir aracı çağır; metin içeriğini döndür. */
async function callTool(url, name, args = {}) {
  const { sessionId } = await connect(url);
  const r = await rpc(url, "tools/call", { name, arguments: args }, { sessionId });
  const content = (r.result && r.result.content) || [];
  const text = content.filter((c) => c && c.type === "text").map((c) => c.text).join("\n");
  return { isError: !!(r.result && r.result.isError), text: text || JSON.stringify(r.result) };
}

async function healthCheck(url, opts = {}) {
  const startedAt = Date.now();
  try {
    const result = await listTools(url);
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      serverInfo: result.serverInfo || null,
      toolCount: result.tools.length,
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error && (error.message || String(error)),
      checkedAt: Date.now(),
    };
  }
}

async function listToolsWithRetry(url, opts = {}) {
  const attempts = Math.max(1, Math.min(4, Number(opts.attempts) || 3));
  const delayMs = Math.max(50, Number(opts.delayMs) || 350);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await listTools(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
}

module.exports = {
  connect,
  listTools,
  listToolsWithRetry,
  callTool,
  healthCheck,
  PROTOCOL_VERSION,
};
