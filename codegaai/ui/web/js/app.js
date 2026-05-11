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

// ── Çeviri (Faz 28) ──────────────────────────────────────────────────────
let _trTimer = null;
function autoTranslate() {
  clearTimeout(_trTimer);
  _trTimer = setTimeout(doTranslate, 800);
}
async function doTranslate() {
  const text = document.getElementById("tr-input")?.value?.trim();
  const out = document.getElementById("tr-output");
  const method = document.getElementById("tr-method");
  if (!text || !out) return;
  out.textContent = "⏳ Çeviriliyor...";
  const source = document.getElementById("tr-source")?.value || "auto";
  const target = document.getElementById("tr-target")?.value || "tr";
  try {
    const r = await fetch("/api/translate/text", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({text, source, target})
    });
    const d = await r.json();
    out.textContent = d.translated || d.error || "Çeviri başarısız";
    if (method) method.textContent = d.method ? `Yöntem: ${d.method}` : "";
  } catch(e) { out.textContent = "❌ " + e.message; }
}
window.swapLangs = function() {
  const s = document.getElementById("tr-source");
  const t = document.getElementById("tr-target");
  if (!s || !t) return;
  const tmp = s.value; s.value = t.value; t.value = tmp;
  doTranslate();
};

// ── Takvim (Faz 29) ──────────────────────────────────────────────────────
async function loadCalendar() {
  const [evR, tkR] = await Promise.all([
    fetch("/api/calendar/events?upcoming=true"),
    fetch("/api/calendar/tasks?done=false")
  ]);
  const evData = await evR.json();
  const tkData = await tkR.json();
  const evEl = document.getElementById("cal-events");
  const tkEl = document.getElementById("cal-tasks");

  if (evEl) {
    evEl.innerHTML = evData.events?.length
      ? evData.events.map(e => `
          <div style="background:var(--color-surface-2);border-radius:6px;padding:10px;border-left:3px solid var(--color-accent)">
            <div style="font-weight:500">${e.title}</div>
            <div style="font-size:12px;color:var(--color-text-muted)">${e.date} ${e.time}</div>
          </div>`).join("")
      : '<div class="muted" style="font-size:13px">Etkinlik yok</div>';
  }
  if (tkEl) {
    tkEl.innerHTML = tkData.tasks?.length
      ? tkData.tasks.map(t => `
          <div style="background:var(--color-surface-2);border-radius:6px;padding:10px;display:flex;gap:8px;align-items:center">
            <button onclick="completeTask('${t.id}')" style="background:none;border:1px solid var(--color-border);border-radius:50%;width:20px;height:20px;cursor:pointer;flex-shrink:0"></button>
            <div>
              <div style="font-size:13px">${t.title}</div>
              ${t.due_date ? `<div style="font-size:11px;color:var(--color-text-muted)">${t.due_date}</div>` : ""}
            </div>
          </div>`).join("")
      : '<div class="muted" style="font-size:13px">Görev yok 🎉</div>';
  }
}
window.completeTask = async function(id) {
  await fetch(`/api/calendar/tasks/${id}/done`, {method:"POST"});
  loadCalendar();
};
window.showAddEvent = function() {
  const title = prompt("Etkinlik adı:");
  if (!title) return;
  const date = prompt("Tarih (YYYY-MM-DD):", new Date().toISOString().split("T")[0]);
  if (!date) return;
  fetch("/api/calendar/events", {method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({title, date})
  }).then(() => loadCalendar());
};
window.showAddTask = function() {
  const title = prompt("Görev:");
  if (!title) return;
  fetch("/api/calendar/tasks", {method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({title})
  }).then(() => loadCalendar());
};
window.extractCalendar = async function() {
  const input = document.getElementById("cal-extract-input");
  if (!input?.value?.trim()) return;
  const r = await fetch("/api/calendar/extract", {method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({text: input.value})});
  const d = await r.json();
  input.value = "";
  loadCalendar();
  alert(`Çıkarıldı: ${d.extracted_events?.length||0} etkinlik, ${d.extracted_tasks?.length||0} görev`);
};

// Takvim görünümüne geçince yükle
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('.nav-item[data-view="calendar"]').forEach(btn => {
    btn.addEventListener("click", loadCalendar);
  });
});
