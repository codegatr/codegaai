/* ============================================================
   CODEGA AI - Sohbet (kalıcı, çoklu sohbet desteği)
   ============================================================ */

const Chat = (() => {
  const state = {
    chatId: null,           // Aktif sohbet (null = yeni, henüz oluşturulmadı)
    chatTitle: "Yeni sohbet",
    messages: [],
    sending: false,
  };

  let elInput, elMessages, elForm, elSend, elTitle, elDelete, elRename;

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
    return el("div", { class: `message message--${msg.role}` },
      el("div", { class: "message__avatar" }, isUser ? "Y" : "C"),
      el("div", { class: "message__body" },
        el("div", { class: "message__role" }, isUser ? "Sen" : "CODEGA AI"),
        el("div", {
          class: "message__content",
          html: renderMarkdown(msg.content),
        }),
      ),
    );
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
    elMessages.appendChild(renderMessage(msg));
    scrollToBottom();
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

  function updateHeader() {
    if (elTitle) elTitle.textContent = state.chatTitle || "Yeni sohbet";
    const hasChat = state.chatId !== null;
    if (elDelete) elDelete.disabled = !hasChat;
    if (elRename) elRename.disabled = !hasChat;
  }

  // ---------- Sohbet yükleme/yönetimi ----------

  function loadChat(chatData, messages) {
    state.chatId = chatData.id;
    state.chatTitle = chatData.title || "Yeni sohbet";
    state.messages = (messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    renderAll();
  }

  function clearActive() {
    state.chatId = null;
    state.chatTitle = "Yeni sohbet";
    state.messages = [];
    renderAll();
  }

  // ---------- Gönder ----------

  async function send(text) {
    text = String(text || "").trim();
    if (!text || state.sending) return;

    state.sending = true;
    elSend.disabled = true;

    // Aktif sohbet yoksa, otomatik yeni oluştur
    if (state.chatId === null) {
      const newChat = await Chats.createNew();
      if (!newChat) {
        state.sending = false;
        elSend.disabled = false;
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

    try {
      const resp = await API.chat(state.messages, { chat_id: state.chatId });
      hideTyping();

      const assistantMsg = resp.message || {
        role: "assistant",
        content: "(boş yanıt)",
      };
      state.messages.push(assistantMsg);
      appendMessage(assistantMsg);

      // Model etiketi
      const lbl = document.getElementById("chat-model-label");
      if (lbl && resp.model) {
        lbl.innerHTML = `Model: <code>${escapeHTML(resp.model)}</code>`;
      }

      // Sidebar listesini tazele (başlık ilk mesajdan otomatik üretildi olabilir)
      Chats.reload();
    } catch (err) {
      hideTyping();
      console.error(err);
      appendMessage({
        role: "assistant",
        content: `**Hata:** ${err.message || "Bilinmeyen hata"}`,
      });
    } finally {
      state.sending = false;
      elSend.disabled = false;
      elInput.focus();
    }
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

    if (!elInput || !elMessages || !elForm) return;

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
  }

  return { init, send, rename, deleteCurrent };
})();

window.Chat = Chat;
