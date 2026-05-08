/* ============================================================
   CODEGA AI - Sohbet
   ============================================================ */

const Chat = (() => {
  const state = {
    messages: [],
    sending: false,
  };

  let elInput, elMessages, elForm, elSend;

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
        ? document.createTextNode(c)
        : c);
    }
    return node;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // Çok hafif markdown — paragraflar, **bold**, `code`, satır sonu
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

  function clearWelcome() {
    const w = elMessages.querySelector(".welcome");
    if (w) w.remove();
  }

  function appendMessage(msg) {
    clearWelcome();
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

  // ---------- Aksiyonlar ----------

  async function send(text) {
    text = String(text || "").trim();
    if (!text || state.sending) return;

    state.sending = true;
    elSend.disabled = true;

    const userMsg = { role: "user", content: text };
    state.messages.push(userMsg);
    appendMessage(userMsg);

    elInput.value = "";
    autoResize();
    showTyping();

    try {
      const resp = await API.chat(state.messages);
      hideTyping();

      const assistantMsg = resp.message || {
        role: "assistant",
        content: "(boş yanıt)",
      };
      state.messages.push(assistantMsg);
      appendMessage(assistantMsg);

      // Model etiketini güncelle
      const lbl = document.getElementById("chat-model-label");
      if (lbl && resp.model) {
        lbl.innerHTML = `Model: <code>${escapeHTML(resp.model)}</code>`;
      }
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

  function clear() {
    state.messages = [];
    elMessages.innerHTML = "";
    // Hoş geldin ekranını yeniden göster
    elMessages.appendChild(buildWelcome());
  }

  function buildWelcome() {
    // Orijinal welcome HTML'ini yeniden ekle
    const tmpl = document.createElement("div");
    tmpl.innerHTML = `
      <div class="welcome">
        <div class="welcome__brand"><span class="welcome__brand-c">C</span></div>
        <h2 class="welcome__title">Yeni sohbet</h2>
        <p class="welcome__subtitle">Yeni bir konuyla başla.</p>
      </div>
    `;
    return tmpl.firstElementChild;
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

    if (!elInput || !elMessages || !elForm) return;

    // Önerilen kart tıklamaları
    document.querySelectorAll(".suggestion-card[data-suggest]").forEach((card) => {
      card.addEventListener("click", () => {
        elInput.value = card.dataset.suggest;
        autoResize();
        elInput.focus();
      });
    });

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

    // Yeni / Temizle
    document.getElementById("chat-new")?.addEventListener("click", clear);
    document.getElementById("chat-clear")?.addEventListener("click", clear);

    // Sohbet görünümüne geçildiğinde input'a odaklan
    Views.on((name) => {
      if (name === "chat") {
        setTimeout(() => elInput.focus(), 50);
      }
    });

    autoResize();
  }

  return { init, send, clear };
})();

window.Chat = Chat;
