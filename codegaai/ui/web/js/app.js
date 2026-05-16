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

// ── Sistem Monitörü UI (Faz 49) ───────────────────────────────────────────
const MonitorUI = (() => {
  let _timer = null;
  let _cpuHistory = [];
  const MAX_HIST = 30;

  async function poll() {
    try {
      const d = await fetch("/api/monitor/system/snapshot").then(r => r.json());
      // Metrik kartları
      _setCard("mon-cpu",  `CPU\n<b>${d.cpu_percent ?? "—"}%</b>`);
      _setCard("mon-ram",  `RAM\n<b>${d.ram_used_gb ?? "—"} / ${d.ram_total_gb ?? "—"} GB</b>`);
      _setCard("mon-disk", `Disk\n<b>${d.disk_percent ?? "—"}%</b>`);
      _setCard("mon-gpu",  `VRAM\n<b>${d.gpu_vram_percent != null ? d.gpu_vram_percent + "%" : "Yok"}</b>`);
      // Mini tarih CPU grafiği (bar chart ASCII)
      _cpuHistory.push(d.cpu_percent ?? 0);
      if (_cpuHistory.length > MAX_HIST) _cpuHistory.shift();
      const bars = _cpuHistory.map(v => {
        const h = Math.round(v / 10);
        const chars = ["▁","▂","▃","▄","▅","▆","▇","█"];
        return chars[Math.min(h, 7)];
      }).join("");
      const hist = document.getElementById("mon-history");
      if (hist) hist.textContent = `CPU: ${bars}  ${d.cpu_percent ?? 0}%`;
      // Uyarılar
      const warn = document.getElementById("mon-warnings");
      if (warn) {
        warn.innerHTML = (d.warnings || []).map(w =>
          `<div style="color:var(--color-danger);font-size:12px">⚠ ${w}</div>`
        ).join("");
      }
      // Durum göstergesi
      const dot = document.getElementById("monitor-status-dot");
      const txt = document.getElementById("monitor-status-txt");
      if (dot) dot.style.background = d.health === "ok" ? "var(--color-success)"
                                     : d.health === "warning" ? "var(--color-accent)" : "var(--color-danger)";
      if (txt) txt.textContent = `${d.health === "ok" ? "Sağlıklı" : d.health === "warning" ? "Uyarı" : "Kritik"} · ${d.ts || ""}`;
    } catch(e) {}
  }

  function _setCard(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function toggle() {
    const btn = document.querySelector("[onclick='MonitorUI.toggle()']");
    if (_timer) {
      clearInterval(_timer); _timer = null;
      fetch("/api/monitor/system/monitor", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:false})});
      if (btn) btn.textContent = "Başlat";
    } else {
      fetch("/api/monitor/system/monitor", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true,interval_sec:5})});
      _timer = setInterval(poll, 3000);
      poll();
      if (btn) btn.textContent = "Durdur";
    }
  }

  // Sistem sayfası açılınca otomatik başlat
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.nav-item[data-view="system"],.toolbar-nav[data-view="system"]').forEach(b => {
      b.addEventListener("click", () => {
        if (!_timer) toggle();
      });
    });
  });

  return { toggle, poll };
})();


// ── Proje Yöneticisi UI (Faz 50) ──────────────────────────────────────────
const ProjectUI = (() => {
  const PRIORITY_COLORS = {critical:"#ef4444",high:"#f97316",medium:"var(--color-accent)",low:"#6b7280"};

  async function init() {
    const sel = document.getElementById("proj-select");
    if (!sel) return;
    const d = await fetch("/api/monitor/projects").then(r => r.json()).catch(() => ({projects:[]}));
    sel.innerHTML = '<option value="">Proje seç...</option>' +
      (d.projects || []).map(p => `<option value="${p.id}">${p.name} (${p.progress}%)</option>`).join("");
    if (d.projects?.length) { sel.value = d.projects[0].id; loadBoard(); }
  }

  async function loadBoard() {
    const pid = document.getElementById("proj-select")?.value;
    const sprint = document.getElementById("sprint-select")?.value || 1;
    if (!pid) return;
    const d = await fetch(`/api/monitor/sprint/${pid}/${sprint}`).then(r => r.json()).catch(() => ({}));
    ["todo","in_progress","review","done"].forEach(status => {
      const col = document.getElementById(`col-${status}`);
      if (!col) return;
      const tasks = (d.board || {})[status] || [];
      col.innerHTML = tasks.length ? tasks.map(t => `
        <div class="kanban-card" style="border-left-color:${PRIORITY_COLORS[t.priority]||'#888'}">
          <div style="font-size:13px;font-weight:500">${t.title}</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">
            ${t.priority} · ${t.estimated_hours ? t.estimated_hours+"sa" : "?"}
            ${t.ai_priority_score ? `· <span style="color:var(--color-accent)">AI:${t.ai_priority_score}</span>` : ""}
          </div>
          <div style="display:flex;gap:4px;margin-top:6px">
            <button style="font-size:10px;padding:1px 6px;border:1px solid var(--color-border);border-radius:3px;background:none;color:var(--color-text);cursor:pointer"
              onclick="ProjectUI.moveTask('${t.id}','${_nextStatus(status)}')">→</button>
          </div>
        </div>`).join("")
        : `<div class="muted" style="font-size:12px;padding:8px">Boş</div>`;
    });
  }

  const _nextStatus = s => ({todo:"in_progress",in_progress:"review",review:"done",done:"done"})[s]||"done";

  async function moveTask(taskId, newStatus) {
    await fetch(`/api/monitor/tasks/${taskId}`, {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({task_id:taskId,status:newStatus})});
    loadBoard();
  }

  async function aiPrioritize() {
    const pid = document.getElementById("proj-select")?.value;
    if (!pid) return alert("Proje seç");
    const btn = document.querySelector("[onclick='ProjectUI.aiPrioritize()']");
    if (btn) btn.textContent = "⏳ Analiz...";
    await fetch(`/api/monitor/tasks/${pid}/ai-prioritize`, {method:"POST"});
    loadBoard();
    if (btn) btn.textContent = "🤖 AI Önceliklendir";
  }

  async function aiPlan() {
    const pid = document.getElementById("proj-select")?.value;
    if (!pid) return alert("Proje seç");
    const out = document.getElementById("proj-ai-output");
    if (out) { out.style.display = "block"; out.textContent = "⏳ Plan hazırlanıyor..."; }
    const d = await fetch(`/api/monitor/projects/${pid}/ai-plan`, {method:"POST"}).then(r => r.json()).catch(() => ({plan:"Hata"}));
    if (out) out.textContent = d.plan || d.error || "Hata";
  }

  function newProject() {
    const name = prompt("Proje adı:");
    if (!name) return;
    const deadline = prompt("Deadline (YYYY-MM-DD, boş bırakılabilir):");
    fetch("/api/monitor/projects", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name, deadline: deadline||""})})
      .then(() => init());
  }

  function newTask() {
    const pid = document.getElementById("proj-select")?.value;
    if (!pid) return alert("Önce proje seç");
    const title = prompt("Görev adı:");
    if (!title) return;
    const priority = prompt("Öncelik (low/medium/high/critical):", "medium") || "medium";
    fetch("/api/monitor/tasks", {method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({project_id:pid, title, priority})})
      .then(() => loadBoard());
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('[data-view="projects"]').forEach(btn => {
      btn.addEventListener("click", init);
    });
  });

  return { init, loadBoard, moveTask, aiPrioritize, aiPlan, newProject, newTask };
})();


// ── Geliştirici Araçları UI (Faz 37-39, 44, 46) ──────────────────────────
const DevToolUI = (() => {
  let _currentTab = "sast";

  function tab(name, btn) {
    _currentTab = name;
    document.querySelectorAll("#devtool-tabs button").forEach(b => {
      b.classList.toggle("active", b === btn);
      b.classList.toggle("btn--ghost", b !== btn);
    });
    ["sast","testgen","rename"].forEach(t => {
      const el = document.getElementById(`dt-extra-${t}`);
      if (el) el.style.display = t === name ? "flex" : "none";
    });
  }

  async function run() {
    const code = document.getElementById("dt-code")?.value;
    if (!code?.trim()) return;
    const lang = document.getElementById("dt-lang")?.value || "php";
    const result = document.getElementById("dt-result");
    const btn = document.getElementById("dt-run-btn");
    if (btn) btn.textContent = "⏳";
    if (result) result.textContent = "İşleniyor...";

    try {
      let url, body;
      if (_currentTab === "sast") {
        url  = "/api/devtools/sast/scan";
        body = {code, language: lang, ai_analysis: document.getElementById("dt-ai-analysis")?.checked};
        const d = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
        result.innerHTML = `<b>Risk Skoru: ${d.risk_score}/100</b> · ${d.summary?.total||0} sorun\n\n` +
          (d.findings||[]).map(f => `<span style="color:${f.severity==='high'?'#ef4444':'#f97316'}">■</span> [${f.severity.toUpperCase()}] Satır ${f.line}: ${f.description}\n  ${f.code}`).join("\n\n") +
          (d.ai_report ? "\n\n─ AI Raporu ─\n" + d.ai_report : "");
      } else if (_currentTab === "testgen") {
        url  = "/api/devtools/testgen";
        body = {code, language: lang, test_type: document.getElementById("dt-test-type")?.value || "unit"};
        const d = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
        result.textContent = d.test_code || d.error;
      } else if (_currentTab === "profiler") {
        url  = "/api/devtools/profiler/analyze";
        body = {code, language: lang};
        const d = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
        result.textContent = `Not: ${d.grade} · Karmaşıklık: ${d.metrics?.complexity?.total} · ${d.metrics?.bottleneck_count} darboğaz\n\n` + d.ai_suggestions;
      } else if (_currentTab === "rename") {
        url  = "/api/powertools/rename/preview";
        body = {code, language:lang, old_name:document.getElementById("dt-old-name")?.value||"",new_name:document.getElementById("dt-new-name")?.value||"",rename_type:document.getElementById("dt-rename-type")?.value||"function"};
        const d = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
        result.textContent = `${d.changes_count} değişiklik:\n\n` + d.diff;
      } else if (_currentTab === "clones") {
        const fname = "file." + lang;
        url  = "/api/intelligence/clones/detect";
        body = {files:{[fname]:code}, language:lang};
        const d = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
        result.textContent = `Tekrar oranı: ${d.duplication_ratio}% (Not: ${d.grade})\n${d.clone_count} klon grubu\n\n` + d.ai_suggestions;
      }
    } catch(e) {
      if (result) result.textContent = "❌ " + e.message;
    } finally {
      if (btn) btn.textContent = "▶ Çalıştır";
    }
  }

  return { tab, run };
})();
