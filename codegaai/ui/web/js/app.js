/* ============================================================
   CODEGA AI - Ana giriş
   ============================================================ */

(function bootstrap() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  async function start() {
    console.log("%c CODEGA AI ", "background:#f59e0b;color:#0a0b0d;font-weight:700;padding:2px 6px;border-radius:3px;",
                "Faz 2 - Masaüstü UI");

    // Sunucu erişilebilir mi?
    try {
      await API.health();
      setStatus("server", "ok", "Sunucu hazır");
    } catch (err) {
      setStatus("server", "err", "Sunucu erişilemiyor");
      console.error("Backend bağlantı hatası:", err);
    }

    // Modüller
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

    // Federe ağ UI (basit inline init)
    (function() {
      const statEl = document.getElementById("fed-stats");
      const pillEl = document.getElementById("fed-pill");
      const enableBtn = document.getElementById("fed-enable-btn");
      const disableBtn = document.getElementById("fed-disable-btn");
      const syncBtn = document.getElementById("fed-sync-btn");
      if (!statEl) return;

      async function load() {
        try {
          const r = await fetch("/api/federation/status");
          const d = await r.json();
          const enabled = d.enabled;

          if (pillEl) {
            pillEl.className = `status-pill ${enabled ? "status-pill--ok" : "status-pill--off"}`;
            pillEl.innerHTML = `<span class="status-pill__dot"></span>${enabled ? d.state : "Ağ Bağlantısı Kapalı"}`;
          }
          if (enableBtn) enableBtn.hidden = enabled;
          if (disableBtn) disableBtn.hidden = !enabled;
          if (syncBtn) syncBtn.hidden = !enabled;

          statEl.innerHTML = `
            <div class="learn-stat"><span class="learn-stat__label">Durum</span><span class="learn-stat__val">${d.state}</span></div>
            <div class="learn-stat"><span class="learn-stat__label">Node ID</span><span class="learn-stat__val" style="font-family:monospace;font-size:11px">${d.node_id}</span></div>
            <div class="learn-stat"><span class="learn-stat__label">Komşu Node</span><span class="learn-stat__val">${d.peers_count}</span></div>
            <div class="learn-stat"><span class="learn-stat__label">Alınan Bilgi</span><span class="learn-stat__val">${d.knowledge_received} öğe</span></div>
            <div class="learn-stat"><span class="learn-stat__label">Son Sync</span><span class="learn-stat__val">${d.last_sync ? new Date(d.last_sync*1000).toLocaleString("tr-TR") : "—"}</span></div>`;
        } catch (e) {}
      }

      if (enableBtn) enableBtn.addEventListener("click", async () => {
        await fetch("/api/federation/enable", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({coordinator:"https://ai.codega.com.tr/api/federation"})});
        load();
      });
      if (disableBtn) disableBtn.addEventListener("click", async () => {
        await fetch("/api/federation/disable", {method:"POST"});
        load();
      });
      if (syncBtn) syncBtn.addEventListener("click", async () => {
        syncBtn.textContent = "Sync...";
        syncBtn.disabled = true;
        await fetch("/api/federation/sync", {method:"POST"});
        load();
        syncBtn.textContent = "Manuel Sync";
        syncBtn.disabled = false;
      });

      load();
    })();
