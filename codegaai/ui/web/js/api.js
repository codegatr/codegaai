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

    // ---- models (Faz 3) ----
    modelsAll:        () => request("/api/models"),
    modelsLLM:        () => request("/api/models/llm"),
    modelsEmbedding:  () => request("/api/models/embedding"),
    modelStatus:      (id) => request(`/api/models/${id}/status`),
    modelDownload:    (id) => request(`/api/models/${id}/download`, {method:"POST"}),
    modelCancel:      (id) => request(`/api/models/${id}/cancel`,   {method:"POST"}),
    modelLoad:        (id) => request(`/api/models/${id}/load`,     {method:"POST"}),
    modelUnload:      (id) => request(`/api/models/${id}/unload`,   {method:"POST"}),
    modelDelete:      (id) => request(`/api/models/${id}`,          {method:"DELETE"}),

    // ---- image (Faz 4) ----
    imageGenerate: (body) => request("/api/image/generate", {method:"POST", body: JSON.stringify(body)}),
    imageList:     () => request("/api/image/list?limit=50"),
    imageDelete:   (id) => request(`/api/image/${id}`, {method:"DELETE"}),
    imageStatus:   () => request("/api/image/status"),

    // ---- internet öğrenmesi (Faz 10) ----
    learnStatus:   () => request("/api/learn/status"),
    learnSearch:   (q, opts={}) => request("/api/learn/search", {method:"POST", body: JSON.stringify({query:q, ...opts})}),
    learnTopics:   (topics) => request("/api/learn/topics", {method:"POST", body: JSON.stringify({topics})}),
    learnFeeds:    () => request("/api/learn/feeds", {method:"POST"}),
    learnFromChat: (chatId) => request(`/api/learn/chat/${chatId}`, {method:"POST"}),
    learnCancel:   () => request("/api/learn/cancel", {method:"POST"}),
    learnLog:      (limit=50) => request(`/api/learn/log?limit=${limit}`),
    learnFeedList: () => request("/api/learn/feeds"),
    learnFeedAdd:  (data) => request("/api/learn/feeds/add", {method:"POST", body: JSON.stringify(data)}),
    learnFeedToggle: (i, enabled) => request(`/api/learn/feeds/${i}/toggle`, {method:"PATCH", body: JSON.stringify({enabled})}),
    learnFeedDel:  (i) => request(`/api/learn/feeds/${i}`, {method:"DELETE"}),
    schedulerStatus: () => request("/api/learn/scheduler"),
    schedulerRun:  (id) => request(`/api/learn/scheduler/${id}/run`, {method:"POST"}),
    schedulerToggle: (id, enabled) => request(`/api/learn/scheduler/${id}/toggle`, {method:"POST", body: JSON.stringify({enabled})}),

    // ---- updater (Faz 8) ----
    updaterCheck:    (force=false) => request(`/api/updater/check?force=${force}`),
    updaterStatus:   () => request("/api/updater/status"),
    updaterDownload: (version) => request("/api/updater/download", {method:"POST", body: JSON.stringify({version})}),
    updaterCancel:   () => request("/api/updater/cancel", {method:"POST"}),
    updaterApply:    () => request("/api/updater/apply", {method:"POST"}),
    updaterInstallDir: () => request("/api/updater/install-dir"),

    // ---- learning (Faz 7) ----
    learningStats:     () => request("/api/learning/stats"),
    learningDataset:   () => request("/api/learning/dataset?min_pairs=4"),
    learningFeedback:  (limit=50) => request(`/api/learning/feedback?limit=${limit}`),
    feedbackAdd:       (body) => request("/api/learning/feedback", {method:"POST", body: JSON.stringify(body)}),
    feedbackRemove:    (chatId, msgId) => request(`/api/learning/feedback/${chatId}/${msgId}`, {method:"DELETE"}),
    adaptersList:      () => request("/api/learning/adapters"),
    adapterActivate:   (id) => request("/api/learning/adapters/activate", {method:"POST", body: JSON.stringify({adapter_id: id})}),
    adapterDelete:     (id) => request(`/api/learning/adapters/${id}`, {method:"DELETE"}),
    learningTrain:     (body) => request("/api/learning/train", {method:"POST", body: JSON.stringify(body)}),
    learningStatus:    () => request("/api/learning/status"),
    learningDeps:      () => request("/api/learning/dependencies"),

    // ---- video (Faz 6) ----
    videoGenerate:  (body) => request("/api/video/generate", {method:"POST", body: JSON.stringify(body)}),
    videoList:      () => request("/api/video/list?limit=30"),
    videoDelete:    (id) => request(`/api/video/${id}`, {method:"DELETE"}),
    videoStatus:    () => request("/api/video/status"),

    // ---- audio (Faz 5) ----
    audioStatus:    () => request("/api/audio/status"),
    audioVoices:    () => request("/api/audio/voices"),
    audioList:      () => request("/api/audio/list?limit=50"),
    audioDelete:    (id) => request(`/api/audio/${id}`, {method:"DELETE"}),
    tts:            (body) => request("/api/audio/tts", {method:"POST", body: JSON.stringify(body)}),
    // ASR multipart için ayrı (FormData)

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
