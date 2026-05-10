/* ============================================================
   CODEGA AI - Sohbet (kalıcı, çoklu sohbet desteği)
   ============================================================ */

const Chat = (() => {
  const state = {
    chatId: null,           // Aktif sohbet (null = yeni, henüz oluşturulmadı)
    chatTitle: "Yeni sohbet",
    messages: [],
    sending: false,
    queue: [],
  };

  let elInput, elMessages, elForm, elSend, elTitle, elDelete, elRename, elQueueStatus;

  // ---------- DOM yardımcıları ----------

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v !== null && v !== undefined) {
        node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === "string"
        ? document.createTextNode(c) : c);
    }
    return node;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function renderMarkdown(text) {
    const safe = escapeHTML(text);
    const html = safe
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n\n+/g, "</p><p>")
      .replace(/\n/g, "<br>");
    return `<p>${html}</p>`;
  }

  // ---------- Render ----------

  function renderMessage(msg) {
    const isUser = msg.role === "user";
    const children = [
      el("div", { class: "message__avatar" }, isUser ? "Y" : "C"),
      el("div", { class: "message__body" },
        el("div", { class: "message__role" }, isUser ? "Sen" : "CODEGA AI"),
        el("div", {
          class: "message__content",
          html: renderMarkdown(msg.content),
        }),
        // Faz 7: asistan mesajlarına 👍/👎
        !isUser && msg.id && state.chatId
          ? renderFeedbackBar(msg)
          : null,
      ),
    ].filter(Boolean);

    return el("div", { class: `message message--${msg.role}` }, ...children);
  }

  function renderFeedbackBar(msg) {
    const rating = msg.rating || 0;
    const upClass = rating === 1
      ? "feedback-btn feedback-btn--active feedback-btn--up"
      : "feedback-btn";
    const downClass = rating === -1
      ? "feedback-btn feedback-btn--active feedback-btn--down"
      : "feedback-btn";

    return el("div", { class: "message__feedback" },
      el("button", {
        class: upClass,
        title: "Beğendim",
        onclick: () => giveFeedback(msg, 1),
      }, "👍"),
      el("button", {
        class: downClass,
        title: "Beğenmedim",
        onclick: () => giveFeedback(msg, -1),
      }, "👎"),
    );
  }

  async function giveFeedback(msg, rating) {
    if (!state.chatId || !msg.id) return;

    const newRating = msg.rating === rating ? 0 : rating;

    try {
      const idx = state.messages.findIndex(m => m.id === msg.id);
      let userMessage = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (state.messages[i].role === "user") {
          userMessage = state.messages[i].content;
          break;
        }
      }

      if (newRating === 0) {
        await fetch(
          `/api/learning/feedback/${state.chatId}/${msg.id}`,
          { method: "DELETE" }
        );
      } else {
        await fetch("/api/learning/feedback", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            chat_id: state.chatId,
            message_id: msg.id,
            rating: newRating,
            user_message: userMessage,
            assistant_message: msg.content,
            model_id: msg.model || null,
          }),
        });
      }

      msg.rating = newRating;
      renderAll();
    } catch (err) {
      console.error("feedback error:", err);
      alert("Geri bildirim kaydedilemedi: " + err.message);
    }
  }

  function renderTyping() {
    return el("div", { class: "message message--assistant", id: "typing-indicator" },
      el("div", { class: "message__avatar" }, "C"),
      el("div", { class: "message__body" },
        el("div", { class: "message__role" }, "CODEGA AI"),
        el("div", { class: "message__content" },
          el("span", { class: "typing" },
            el("span"), el("span"), el("span"),
          ),
        ),
      ),
    );
  }

  function renderWelcome() {
    const div = document.createElement("div");
    div.className = "welcome";
    div.innerHTML = `
      <div class="welcome__brand"><span class="welcome__brand-c">C</span></div>
      <h2 class="welcome__title">Yeni sohbete başla</h2>
      <p class="welcome__subtitle">
        Yerelde çalışan, hiçbir buluta veri sızdırmayan,
        <em>kendi kendine öğrenen</em> yapay zeka.
      </p>
      <div class="suggestions">
        <button class="suggestion-card" data-suggest="Türkçe yazılım terimleri için bir sözlük hazırla">
          <span class="suggestion-card__icon">📚</span>
          <span class="suggestion-card__title">Sözlük hazırla</span>
          <span class="suggestion-card__desc">Türkçe yazılım terimleri</span>
        </button>
        <button class="suggestion-card" data-suggest="PHP 8.3'te yeni eklenen özellikleri açıkla">
          <span class="suggestion-card__icon">💻</span>
          <span class="suggestion-card__title">Kod öğret</span>
          <span class="suggestion-card__desc">PHP 8.3'ün yeni özellikleri</span>
        </button>
        <button class="suggestion-card" data-suggest="Bana e-ticaret ürün açıklaması yazmayı öğret">
          <span class="suggestion-card__icon">✍️</span>
          <span class="suggestion-card__title">Yazı yardımı</span>
          <span class="suggestion-card__desc">E-ticaret ürün açıklamaları</span>
        </button>
        <button class="suggestion-card" data-suggest="LoRA fine-tuning nasıl çalışır, basit dille anlat">
          <span class="suggestion-card__icon">🧠</span>
          <span class="suggestion-card__title">Konsept öğren</span>
          <span class="suggestion-card__desc">LoRA fine-tuning</span>
        </button>
      </div>
    `;
    // Önerilere tıklamayı bağla
    div.querySelectorAll(".suggestion-card[data-suggest]").forEach((card) => {
      card.addEventListener("click", () => {
        elInput.value = card.dataset.suggest;
        autoResize();
        elInput.focus();
      });
    });
    return div;
  }

  function renderAll() {
    elMessages.innerHTML = "";
    if (state.messages.length === 0) {
      elMessages.appendChild(renderWelcome());
    } else {
      for (const msg of state.messages) {
        elMessages.appendChild(renderMessage(msg));
      }
    }
    scrollToBottom();
    updateHeader();
  }

  function appendMessage(msg) {
    // Welcome'ı temizle
    const w = elMessages.querySelector(".welcome");
    if (w) w.remove();
    const el = renderMessage(msg);
    elMessages.appendChild(el);
    scrollToBottom();
    return el;  // ← Polling için DOM elementi döndür
  }

  function showTyping() {
    elMessages.appendChild(renderTyping());
    scrollToBottom();
  }

  function hideTyping() {
    document.getElementById("typing-indicator")?.remove();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      elMessages.scrollTop = elMessages.scrollHeight;
    });
  }

  function isNearBottom() {
    if (!elMessages) return true;
    return elMessages.scrollHeight - elMessages.scrollTop - elMessages.clientHeight < 96;
  }

  function keepBottomIfNeeded(wasNearBottom) {
    if (!wasNearBottom) return;
    requestAnimationFrame(() => {
      elMessages.scrollTop = elMessages.scrollHeight;
    });
  }

  function updateQueueStatus() {
    if (!elQueueStatus) return;
    const count = state.queue.length;
    if (!state.sending && count === 0) {
      elQueueStatus.hidden = true;
      elQueueStatus.textContent = "";
      if (elSend) elSend.title = "Gonder (Enter)";
      return;
    }

    elQueueStatus.hidden = false;
    const next = count > 0 ? ` Siradaki: "${state.queue[0].slice(0, 80)}${state.queue[0].length > 80 ? "..." : ""}"` : "";
    elQueueStatus.textContent = count > 0
      ? `Cevap uretiliyor. ${count} mesaj sirada.${next}`
      : "Cevap uretiliyor. Yeni mesaj yazip Enter'a basarsan siraya eklenir.";
    if (elSend) elSend.title = state.sending ? "Siraya ekle (Enter)" : "Gonder (Enter)";
  }

  function enqueue(text) {
    state.queue.push(text);
    updateQueueStatus();
  }

  function processNextQueued() {
    if (state.sending || state.queue.length === 0) {
      updateQueueStatus();
      return;
    }
    const next = state.queue.shift();
    updateQueueStatus();
    send(next);
  }

  function updateHeader() {
    if (elTitle) elTitle.textContent = state.chatTitle || "Yeni sohbet";
    const hasChat = state.chatId !== null;
    if (elDelete) elDelete.disabled = !hasChat;
    if (elRename) elRename.disabled = !hasChat;
  }

  // ---------- Sohbet yükleme/yönetimi ----------

  function loadChat(chatData, messages) {
    if (!state.sending) state.queue = [];
    state.chatId = chatData.id;
    state.chatTitle = chatData.title || "Yeni sohbet";
    state.messages = (messages || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      model: m.model,
      rating: 0,
    }));
    renderAll();
    updateQueueStatus();

    // Faz 7: bu sohbete ait feedback'leri yükle
    loadFeedbackForChat();
  }

  async function loadFeedbackForChat() {
    if (!state.chatId) return;
    try {
      const data = await fetch(
        `/api/learning/feedback?limit=200`
      ).then(r => r.json());

      if (!data.feedback) return;
      const byMsgId = {};
      for (const f of data.feedback) {
        if (f.chat_id === state.chatId) {
          byMsgId[f.message_id] = f.rating;
        }
      }

      for (const m of state.messages) {
        if (m.id != null && byMsgId[m.id] !== undefined) {
          m.rating = byMsgId[m.id];
        }
      }
      renderAll();
    } catch (err) {
      console.error("Feedback yüklenemedi:", err);
    }
  }

  function clearActive() {
    if (!state.sending) state.queue = [];
    state.chatId = null;
    state.chatTitle = "Yeni sohbet";
    state.messages = [];
    renderAll();
    updateQueueStatus();
  }

  // ---------- Gönder ----------

  async function send(text) {
    text = String(text || "").trim();
    if (!text) return;
    if (state.sending) {
      enqueue(text);
      elInput.value = "";
      autoResize();
      elInput.focus();
      return;
    }

    state.sending = true;
    if (elSend) elSend.disabled = false;
    updateQueueStatus();

    // Aktif sohbet yoksa, otomatik yeni oluştur
    if (state.chatId === null) {
      const newChat = await Chats.createNew();
      if (!newChat) {
        state.sending = false;
        if (elSend) elSend.disabled = false;
        updateQueueStatus();
        return;
      }
      state.chatId = newChat.id;
      state.chatTitle = newChat.title;
      state.messages = [];
      renderAll();
    }

    const userMsg = { role: "user", content: text };
    state.messages.push(userMsg);
    appendMessage(userMsg);

    elInput.value = "";
    autoResize();
    showTyping();

    // Job polling ile gönder (SSE yerine — PyWebView'da güvenilir)
    try {
      await sendWithPolling(text);
    } catch (err) {
      hideTyping();
      appendMessage({
        role: "assistant",
        content: `**Hata:** ${err.message || "Bilinmeyen hata"}`,
      });
    } finally {
      state.sending = false;
      if (elSend) elSend.disabled = false;
      updateQueueStatus();
      elInput.focus();
      processNextQueued();
    }
  }

  // ── Job Polling ile Chat (SSE yerine, her yerde çalışır) ─────────────
  async function sendWithPolling(text) {
    // Yanıt balonunu oluştur
    const assistantMsg = { role: "assistant", content: "", id: null, rating: 0 };
    state.messages.push(assistantMsg);
    const msgEl = appendMessage(assistantMsg);
    const contentEl = msgEl ? msgEl.querySelector(".message__content") : null;
    if (contentEl) contentEl.innerHTML = '<span class="stream-cursor">▊</span>';

    // İşi başlat
    const startResp = await fetch("/api/jobs/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        chat_id: state.chatId,
        max_tokens: 512,
      }),
    });
    const startData = await startResp.json();
    const jobId = startData.job_id;
    if (!jobId) throw new Error("İş başlatılamadı");

    hideTyping();

    // Poll — her 300ms job durumunu sorgula
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const MAX_MS = 300_000; // 5 dakika maksimum
      let lastLen = 0;

      const poll = setInterval(async () => {
        try {
          const r = await fetch(`/api/jobs/${jobId}`);
          const d = await r.json();

          // Yeni token'lar varsa göster
          if (d.content && d.content.length > lastLen) {
            const shouldStick = isNearBottom();
            lastLen = d.content.length;
            assistantMsg.content = d.content;
            if (contentEl) {
              contentEl.innerHTML = renderMarkdown(d.content) +
                (d.done ? "" : '<span class="stream-cursor">▊</span>');
              keepBottomIfNeeded(shouldStick);
            }
          }

          if (d.done) {
            clearInterval(poll);
            assistantMsg.streaming = false;
            // Timing
            const timeLbl = document.getElementById("status-time-elapsed");
            if (timeLbl) timeLbl.textContent = `${d.elapsed_ms}ms`;
            // Alt çubuk
            const statMs = document.getElementById("chat-elapsed-ms");
            if (statMs) statMs.textContent = d.elapsed_ms + "ms";
            Chats.reload();
            if (d.error) reject(new Error(d.error));
            else resolve();
          }

          // Timeout
          if (Date.now() - t0 > MAX_MS) {
            clearInterval(poll);
            reject(new Error("Zaman aşımı (5dk)"));
          }
        } catch (e) {
          clearInterval(poll);
          reject(e);
        }
      }, 300);
    });
  }

  async function sendStreaming(text) {
    const params = new URLSearchParams({
      message: text,
      chat_id: String(state.chatId),
      max_tokens: "512",
    });

    const url = `/api/chat/stream?${params}`;
    const es = new EventSource(url);

    // Typing indicator açık kalır — ilk token gelince kapanır
    // (hideTyping() burada çağrılmıyor)

    // Yanıt balonunu oluştur (başta typing göster)
    const assistantMsg = {
      role: "assistant", content: "", id: null,
      rating: 0, streaming: true,
    };
    state.messages.push(assistantMsg);
    const msgEl = appendMessage(assistantMsg);
    const contentEl = msgEl ? msgEl.querySelector(".message__content") : null;

    // İlk token gelene kadar cursor animasyonu
    if (contentEl) {
      contentEl.innerHTML = '<span class="stream-cursor">▊</span>';
    }

    return new Promise((resolve, reject) => {
      let accumulated = "";
      let firstToken = true;

      es.addEventListener("message", (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.type === "token") {
            if (firstToken) {
              firstToken = false;
              hideTyping(); // İlk token gelince typing indicator kapat
            }
            accumulated += data.content;
            assistantMsg.content = accumulated;
            if (contentEl) {
              const shouldStick = isNearBottom();
              contentEl.innerHTML = renderMarkdown(accumulated) +
                '<span class="stream-cursor">▊</span>';
              keepBottomIfNeeded(shouldStick);
            }

          } else if (data.type === "tool_result") {
            // Araç sonucunu küçük badge olarak ekle
            if (contentEl) {
              const badge = document.createElement("div");
              badge.className = "tool-badge";
              badge.textContent = `🔧 ${data.name}`;
              badge.title = data.result || "";
              contentEl.parentElement.appendChild(badge);
            }

          } else if (data.type === "done") {
            es.close();
            hideTyping();
            assistantMsg.streaming = false;
            if (data.full_content) {
              assistantMsg.content = data.full_content;
              if (contentEl) contentEl.innerHTML = renderMarkdown(data.full_content); // cursor yok
            } else if (contentEl) {
              // Cursor'ı kaldır
              contentEl.innerHTML = contentEl.innerHTML.replace(/<span class="stream-cursor">.*?<\/span>/g, "");
            }
            // Timing
            const lbl = document.getElementById("chat-model-label");
            if (lbl && data.timing_ms) {
              lbl.textContent = `${data.timing_ms}ms`;
            }
            Chats.reload();
            resolve();

          } else if (data.type === "error") {
            es.close();
            reject(new Error(data.message || "Streaming hatası"));
          }

        } catch (parseErr) {
          console.warn("SSE parse error:", parseErr);
        }
      });

      es.onerror = (err) => {
        es.close();
        reject(new Error("SSE bağlantı hatası"));
      };

      // 3 dakika timeout
      setTimeout(() => {
        es.close();
        reject(new Error("Streaming zaman aşımı (3dk)"));
      }, 180_000);
    });
  }

  async function sendClassic(text) {
    const resp = await API.chat(state.messages, { chat_id: state.chatId });
    hideTyping();

    const assistantMsg = resp.message || {
      role: "assistant",
      content: "(boş yanıt)",
    };
    if (resp.message_id) assistantMsg.id = resp.message_id;
    if (resp.model) assistantMsg.model = resp.model;
    assistantMsg.rating = 0;

    state.messages.push(assistantMsg);
    appendMessage(assistantMsg);

    const lbl = document.getElementById("chat-model-label");
    if (lbl && resp.model) {
      lbl.innerHTML = `Model: <code>${escapeHTML(resp.model)}</code>`;
    }

    Chats.reload();
  }

  // Basit Markdown render (sonraki sürümde marked.js ile)
  function renderMarkdown(text) {
    return text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/```([\s\S]+?)```/g, "<pre><code>$1</code></pre>")
      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
      .replace(/^### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^[•\-] (.+)$/gm, "<li>$1</li>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");
  }

  // ---------- Sil / Yeniden adlandır ----------

  async function rename() {
    if (state.chatId === null) return;
    const newTitle = prompt("Yeni başlık:", state.chatTitle);
    if (!newTitle || newTitle === state.chatTitle) return;
    try {
      await API.chatsRename(state.chatId, newTitle);
      state.chatTitle = newTitle;
      updateHeader();
      Chats.reload();
    } catch (err) {
      alert("Yeniden adlandırma başarısız: " + err.message);
    }
  }

  async function deleteCurrent() {
    if (state.chatId === null) return;
    const ok = confirm(`"${state.chatTitle}" sohbetini sil?`);
    if (!ok) return;
    try {
      await API.chatsDelete(state.chatId);
      clearActive();
      Chats.reload();
    } catch (err) {
      alert("Silme başarısız: " + err.message);
    }
  }

  // ---------- Input davranışı ----------

  function autoResize() {
    elInput.style.height = "24px";
    elInput.style.height = Math.min(elInput.scrollHeight, 200) + "px";
  }

  // ---------- Init ----------

  function init() {
    elInput = document.getElementById("chat-input");
    elMessages = document.getElementById("chat-messages");
    elForm = document.getElementById("chat-form");
    elSend = document.getElementById("chat-send");
    elTitle = document.getElementById("chat-title");
    elDelete = document.getElementById("chat-delete");
    elRename = document.getElementById("chat-rename");
    elQueueStatus = document.getElementById("chat-queue-status");

    if (!elInput || !elMessages || !elForm) return;

    // RAG + Model durumunu periyodik güncelle
    async function updateStatusBar() {
      try {
        // Model durumu
        const sysR = await fetch("/api/system/info");
        const sysD = await sysR.json();
        const modelCode = document.getElementById("chat-model-code");
        if (modelCode && sysD.engine) {
          const m = sysD.engine;
          modelCode.textContent = m.model_id || "—";
          modelCode.style.color = m.state === "ready"
            ? "var(--color-success)" : "var(--color-text-muted)";
        }

        // RAG durumu + embedding yükleme butonu
        const memR = await fetch("/api/memory/status");
        const memD = await memR.json();
        const ragLbl = document.getElementById("rag-status-label");
        if (ragLbl) {
          if (memD.active) {
            ragLbl.innerHTML = 'RAG bellek: <span style="color:var(--color-success)">✓ aktif</span>';
          } else if (memD.chromadb_installed) {
            ragLbl.innerHTML = 'RAG bellek: <span class="muted">embedding yüklenmedi</span> '
              + '<button style="font-size:11px;padding:1px 6px;border:1px solid var(--color-border);'
              + 'border-radius:4px;background:none;color:var(--color-accent);cursor:pointer" '
              + 'onclick="loadEmbedding()">Yükle</button>';
          } else {
            ragLbl.innerHTML = 'RAG bellek: <span class="muted">chromadb eksik</span>';
          }
        }
      } catch (e) {}
    }

    updateStatusBar();
    setInterval(updateStatusBar, 8000); // 8 sn'de bir güncelle

    // Form submit
    elForm.addEventListener("submit", (e) => {
      e.preventDefault();
      send(elInput.value);
    });

    // Enter göndermek, Shift+Enter yeni satır
    elInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(elInput.value);
      }
    });

    elInput.addEventListener("input", autoResize);

    // Header butonları
    elDelete?.addEventListener("click", deleteCurrent);
    elRename?.addEventListener("click", rename);

    // Welcome ekranındaki suggestion-card'lara bağla
    document.querySelectorAll(".suggestion-card[data-suggest]").forEach((card) => {
      card.addEventListener("click", () => {
        elInput.value = card.dataset.suggest;
        autoResize();
        elInput.focus();
      });
    });

    // Sohbet listesinden seçim olayını dinle
    Chats.on((event) => {
      if (event.type === "load") {
        loadChat(event.chat, event.messages);
      } else if (event.type === "create") {
        state.chatId = event.chat.id;
        state.chatTitle = event.chat.title;
        state.messages = [];
        renderAll();
      } else if (event.type === "delete") {
        if (state.chatId === event.id) {
          clearActive();
        }
      }
    });

    // Sohbet sekmesine geçildiğinde input'a odaklan
    Views.on((name) => {
      if (name === "chat") {
        setTimeout(() => elInput.focus(), 50);
      }
    });

    autoResize();
    updateHeader();
    updateQueueStatus();
  }

  return { init, send, rename, deleteCurrent };
})();

window.Chat = Chat;

// Alt çubuktan embedding yükleme
window.loadEmbedding = async function() {
  const ragLbl = document.getElementById("rag-status-label");
  if (ragLbl) ragLbl.innerHTML = 'RAG bellek: <span class="muted">BGE-M3 yükleniyor...</span>';
  try {
    await fetch("/api/models/bge-m3/load", { method: "POST" });
    setTimeout(async () => {
      const r = await fetch("/api/memory/status");
      const d = await r.json();
      if (ragLbl) {
        ragLbl.innerHTML = d.active
          ? 'RAG bellek: <span style="color:var(--color-success)">✓ aktif</span>'
          : 'RAG bellek: <span class="muted">yükleme başarısız — Sistem → İndir</span>';
      }
    }, 3000);
  } catch(e) {
    if (ragLbl) ragLbl.innerHTML = 'RAG bellek: <span class="muted">hata: ' + e.message + '</span>';
  }
};
