/* ============================================================
   CODEGA AI - Sohbet Listesi (Sidebar)
   ============================================================
   Claude'daki "Recents" benzeri kalıcı sohbet geçmişi.
   ============================================================ */

const Chats = (() => {
  const state = {
    items: [],
    activeId: null,
    listeners: [],
  };

  let elList;

  // ---------- Yardımcılar ----------

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

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

  // ---------- Render ----------

  function render() {
    if (!elList) return;

    if (state.items.length === 0) {
      elList.innerHTML = '<div class="chat-list__empty">Henüz sohbet yok</div>';
      return;
    }

    elList.innerHTML = "";
    for (const chat of state.items) {
      const isActive = chat.id === state.activeId;
      const title = chat.title || "Yeni sohbet";

      const deleteBtn = el("button", {
        class: "chat-list-item__delete",
        title: "Sohbeti sil",
        "aria-label": "Sil",
        onclick: (e) => {
          e.stopPropagation();
          handleDelete(chat.id, title);
        },
      });
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

      const item = el("button", {
        class: "chat-list-item" + (isActive ? " active" : ""),
        title: title,
        "data-chat-id": chat.id,
        onclick: () => setActive(chat.id),
      },
        el("span", { class: "chat-list-item__title" }, title),
        deleteBtn,
      );
      elList.appendChild(item);
    }
  }

  // ---------- Aksiyonlar ----------

  async function reload() {
    try {
      const data = await API.chatsList();
      state.items = data.chats || [];
      render();
    } catch (err) {
      console.error("Sohbet listesi yüklenemedi:", err);
    }
  }

  async function createNew() {
    try {
      const data = await API.chatsCreate();
      const newChat = data.chat;
      state.items.unshift(newChat);
      state.activeId = newChat.id;
      render();
      notifyListeners({ type: "create", chat: newChat });
      // Sohbet görünümüne geç
      Views.activate("chat");
      return newChat;
    } catch (err) {
      console.error("Yeni sohbet oluşturulamadı:", err);
      alert("Yeni sohbet oluşturulamadı: " + err.message);
      return null;
    }
  }

  async function setActive(id) {
    state.activeId = id;
    render();
    Views.activate("chat");

    try {
      const data = await API.chatsGet(id);
      notifyListeners({
        type: "load",
        chat: data.chat,
        messages: data.messages || [],
      });
    } catch (err) {
      console.error("Sohbet yüklenemedi:", err);
    }
  }

  async function handleDelete(id, title) {
    const ok = confirm(`"${title}" sohbetini silmek istediğine emin misin?\nBu işlem geri alınamaz.`);
    if (!ok) return;

    try {
      await API.chatsDelete(id);
      state.items = state.items.filter((c) => c.id !== id);
      if (state.activeId === id) {
        state.activeId = null;
        notifyListeners({ type: "delete", id });
      }
      render();
    } catch (err) {
      console.error("Sohbet silinemedi:", err);
      alert("Sohbet silinemedi: " + err.message);
    }
  }

  function updateLocalChat(chatPatch) {
    const idx = state.items.findIndex((c) => c.id === chatPatch.id);
    if (idx >= 0) {
      state.items[idx] = { ...state.items[idx], ...chatPatch };
      // En üste taşı (yeni güncellendi)
      const item = state.items.splice(idx, 1)[0];
      state.items.unshift(item);
      render();
    }
  }

  // ---------- Event sistemi ----------

  function on(fn) {
    state.listeners.push(fn);
  }

  function notifyListeners(event) {
    state.listeners.forEach((fn) => {
      try { fn(event); } catch (e) { console.error(e); }
    });
  }

  // ---------- Init ----------

  function init() {
    elList = document.getElementById("chat-list");

    document.getElementById("new-chat-btn")?.addEventListener("click", () => {
      createNew();
    });

    // Klavye kısayolu: N (input/textarea dışında)
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        createNew();
      }
    });

    reload();
  }

  return {
    init, reload, createNew, setActive, on,
    activeId: () => state.activeId,
    updateLocal: updateLocalChat,
  };
})();

window.Chats = Chats;
