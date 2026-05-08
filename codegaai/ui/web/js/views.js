/* ============================================================
   CODEGA AI - Görünüm yöneticisi
   ============================================================ */

const Views = (() => {
  const state = {
    current: "chat",
    listeners: [],
  };

  function activate(name) {
    if (state.current === name) return;

    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });

    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active", view.dataset.view === name);
    });

    const previous = state.current;
    state.current = name;
    state.listeners.forEach((fn) => {
      try { fn(name, previous); } catch (e) { console.error(e); }
    });
  }

  function on(fn) {
    state.listeners.push(fn);
  }

  function init() {
    document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => activate(btn.dataset.view));
    });

    // Klavye kısayolları: 1-5
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const map = {
        "1": "chat",
        "2": "image",
        "3": "video",
        "4": "audio",
        "5": "memory",
      };
      if (map[e.key]) {
        e.preventDefault();
        activate(map[e.key]);
      }
    });
  }

  return { init, activate, on, current: () => state.current };
})();

window.Views = Views;
