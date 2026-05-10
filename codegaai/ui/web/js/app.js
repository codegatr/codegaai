/* ============================================================
   CODEGA AI - Main entry
   ============================================================ */

(function bootstrap() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  async function start() {
    console.log("%c CODEGA AI ", "background:#f59e0b;color:#0a0b0d;font-weight:700;padding:2px 6px;border-radius:3px;",
                "Faz 2 - Desktop UI");

    try {
      await API.health();
      setStatus("server", "ok", "Sunucu hazir");
    } catch (err) {
      setStatus("server", "err", "Sunucu erisilemiyor");
      console.error("Backend baglanti hatasi:", err);
    }

    Views.init();
    Chats.init();
    Chat.init();
    System.init();
    Models.init();
    ImageView.init();
    AudioView.init();
    VideoView.init();
    Learning.init();
    Updater.init();
    WebLearn.init();
    AutoLearn.init();
    Vision.init();
  }

  function setStatus(key, type, text) {
    const node = document.getElementById(`status-${key}`);
    if (!node) return;
    node.textContent = text;

    const dot = node.previousElementSibling;
    if (dot && dot.classList.contains("dot")) {
      dot.className = `dot dot--${type}`;
    }
  }
})();

// Federation UI
(function federationUi() {
  const statEl = document.getElementById("fed-stats");
  const pillEl = document.getElementById("fed-pill");
  const enableBtn = document.getElementById("fed-enable-btn");
  const disableBtn = document.getElementById("fed-disable-btn");
  const syncBtn = document.getElementById("fed-sync-btn");
  const coordinatorInput = document.getElementById("fed-coordinator");
  const errorEl = document.getElementById("fed-error");
  if (!statEl) return;

  function stateLabel(state, enabled) {
    if (!enabled) return "Ag Baglantisi Kapali";
    if (state === "connected") return "Bagli";
    if (state === "syncing") return "Senkronize ediliyor";
    return "Cevrimdisi";
  }

  function pillClass(state, enabled) {
    if (!enabled || state === "offline") return "status-pill status-pill--off";
    if (state === "syncing") return "status-pill status-pill--warn";
    return "status-pill status-pill--ok";
  }

  async function load() {
    try {
      const r = await fetch("/api/federation/status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const enabled = d.enabled;
      const label = stateLabel(d.state, enabled);

      if (coordinatorInput && d.coordinator) coordinatorInput.value = d.coordinator;
      if (errorEl) errorEl.textContent = d.last_error ? `Son hata: ${d.last_error}` : "";

      if (pillEl) {
        pillEl.className = pillClass(d.state, enabled);
        pillEl.innerHTML = `<span class="status-pill__dot"></span>${label}`;
      }
      if (enableBtn) enableBtn.hidden = enabled;
      if (disableBtn) disableBtn.hidden = !enabled;
      if (syncBtn) syncBtn.hidden = !enabled;

      statEl.innerHTML = `
        <div class="learn-stat"><span class="learn-stat__label">Durum</span><span class="learn-stat__val">${label}</span></div>
        <div class="learn-stat"><span class="learn-stat__label">Node ID</span><span class="learn-stat__val" style="font-family:monospace;font-size:11px">${d.node_id}</span></div>
        <div class="learn-stat"><span class="learn-stat__label">Komsu Node</span><span class="learn-stat__val">${d.peers_count}</span></div>
        <div class="learn-stat"><span class="learn-stat__label">Alinan Bilgi</span><span class="learn-stat__val">${d.knowledge_received} oge</span></div>
        <div class="learn-stat"><span class="learn-stat__label">Son Sync</span><span class="learn-stat__val">${d.last_sync ? new Date(d.last_sync * 1000).toLocaleString("tr-TR") : "-"}</span></div>`;
    } catch (e) {
      if (errorEl) errorEl.textContent = `Federasyon durumu okunamadi: ${e.message || e}`;
    }
  }

  if (enableBtn) enableBtn.addEventListener("click", async () => {
    enableBtn.disabled = true;
    try {
      const coordinator = (coordinatorInput && coordinatorInput.value.trim()) || "https://ai.codega.com.tr/api/federation";
      const r = await fetch("/api/federation/enable", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({coordinator}),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      if (errorEl) errorEl.textContent = `Federasyon baslatilamadi: ${e.message || e}`;
    } finally {
      enableBtn.disabled = false;
    }
  });

  if (disableBtn) disableBtn.addEventListener("click", async () => {
    disableBtn.disabled = true;
    try {
      await fetch("/api/federation/disable", {method: "POST"});
      await load();
    } finally {
      disableBtn.disabled = false;
    }
  });

  if (syncBtn) syncBtn.addEventListener("click", async () => {
    syncBtn.textContent = "Sync...";
    syncBtn.disabled = true;
    try {
      const r = await fetch("/api/federation/sync", {method: "POST"});
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      if (errorEl) errorEl.textContent = `Sync basarisiz: ${e.message || e}`;
    } finally {
      syncBtn.textContent = "Manuel Sync";
      syncBtn.disabled = false;
    }
  });

  load();
  setInterval(load, 15000);
})();
