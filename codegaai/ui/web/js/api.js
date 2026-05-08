/* ============================================================
   CODEGA AI - API istemcisi
   ============================================================
   Yerel FastAPI backend ile iletişim.
   Tüm istekler 127.0.0.1:8765'e gider, dış ağ yok.
   ============================================================ */

const API = (() => {
  const BASE = ""; // aynı origin

  async function request(path, opts = {}) {
    const url = BASE + path;
    const init = {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...opts.headers,
      },
    };
    if (opts.body !== undefined) {
      init.body = typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body);
    }

    let resp;
    try {
      resp = await fetch(url, init);
    } catch (err) {
      throw new ApiError("Bağlantı hatası", 0, err.message);
    }

    const ctype = resp.headers.get("content-type") || "";
    let data = null;
    if (ctype.includes("application/json")) {
      try { data = await resp.json(); } catch (_) { data = null; }
    } else {
      try { data = await resp.text(); } catch (_) { data = null; }
    }

    if (!resp.ok) {
      const msg = (data && data.detail) ? data.detail
                 : (data && data.message) ? data.message
                 : `HTTP ${resp.status}`;
      throw new ApiError(msg, resp.status, data);
    }
    return data;
  }

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.payload = payload;
    }
  }

  return {
    ApiError,

    // ---- system ----
    info:       () => request("/api/system/info"),
    health:     () => request("/api/system/health"),
    check:      () => request("/api/system/check"),
    engines:    () => request("/api/system/engines"),

    // ---- chat ----
    chat: (messages, opts = {}) => request("/api/chat", {
      method: "POST",
      body: { messages, ...opts },
    }),
    chatModels: () => request("/api/chat/models"),
    chatStatus: () => request("/api/chat/status"),

    // ---- chats (kalıcı sohbet listesi) ----
    chatsList:   () => request("/api/chats"),
    chatsCreate: (title) => request("/api/chats", {
      method: "POST",
      body: { title: title || "Yeni sohbet" },
    }),
    chatsGet:    (id) => request(`/api/chats/${id}`),
    chatsRename: (id, title) => request(`/api/chats/${id}`, {
      method: "PATCH",
      body: { title },
    }),
    chatsDelete: (id) => request(`/api/chats/${id}`, {
      method: "DELETE",
    }),

    // ---- image ----
    imageGen: (prompt, opts = {}) => request("/api/image", {
      method: "POST",
      body: { prompt, ...opts },
    }),
    imageModels: () => request("/api/image/models"),

    // ---- video ----
    videoGen: (prompt, opts = {}) => request("/api/video", {
      method: "POST",
      body: { prompt, ...opts },
    }),
    videoModels: () => request("/api/video/models"),

    // ---- audio ----
    tts: (text, opts = {}) => request("/api/audio/tts", {
      method: "POST",
      body: { text, ...opts },
    }),
    asr: (opts = {}) => request("/api/audio/asr", {
      method: "POST",
      body: opts,
    }),
    voices: () => request("/api/audio/voices"),

    // ---- memory ----
    memorySearch: (query, opts = {}) => request("/api/memory/search", {
      method: "POST",
      body: { query, ...opts },
    }),
    memoryLearn: (content, opts = {}) => request("/api/memory/learn", {
      method: "POST",
      body: { content, ...opts },
    }),
    memoryStats: () => request("/api/memory/stats"),
  };
})();

window.API = API;
