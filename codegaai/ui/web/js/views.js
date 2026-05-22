/* ============================================================
   CODEGA AI - Görünüm yöneticisi
   ============================================================ */

const Views = (() => {
  const state = {
    current: "chat",
    listeners: [],
  };

  const sidebarGroups = {
    image: "tools",
    canvas: "tools",
    audio: "tools",
    vision: "tools",
    translate: "tools",
    memory: "tools",
    autolearn: "tools",
    video: "tools",
    federation: "tools",
    system: "tools",
    "devtools-ui": "tools",
  };

  function sidebarTarget(name) {
    return sidebarGroups[name] || name;
  }

  function activate(name) {
    if (state.current === name) return;

    const navName = sidebarTarget(name);
    document.querySelectorAll(".sidebar .nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === navName);
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
    document.querySelectorAll("button[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => activate(btn.dataset.view));
    });
  }

  return { init, activate, on, current: () => state.current };
})();

window.Views = Views;
