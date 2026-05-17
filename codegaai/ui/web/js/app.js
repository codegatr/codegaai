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

// ═══ Faz 51-55: Gelişmiş Özellikler Modal UI'ları ═══

window.KnowledgeBase = {
  show() {
    const html = `
      <div style="padding:24px;max-width:700px">
        <h2 style="margin:0 0 16px">📚 Bilgi Tabanı</h2>
        
        <div style="margin-bottom:20px">
          <label style="display:block;margin-bottom:8px;font-weight:500">Başlık</label>
          <input id="kb-title" type="text" placeholder="Örn: Python Liste İpuçları" 
                 style="width:100%;padding:10px;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:6px;color:var(--color-text)">
        </div>
        
        <div style="margin-bottom:20px">
          <label style="display:block;margin-bottom:8px;font-weight:500">İçerik</label>
          <textarea id="kb-content" rows="6" placeholder="Not veya belge içeriği..."
                    style="width:100%;padding:10px;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:6px;color:var(--color-text);resize:vertical"></textarea>
        </div>
        
        <div style="margin-bottom:20px">
          <label style="display:block;margin-bottom:8px;font-weight:500">Etiketler (virgülle ayır)</label>
          <input id="kb-tags" type="text" placeholder="python, listeler, ipucu"
                 style="width:100%;padding:10px;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:6px;color:var(--color-text)">
        </div>
        
        <div style="display:flex;gap:10px">
          <button id="kb-save" class="btn btn--primary">Kaydet</button>
          <button id="kb-search" class="btn btn--secondary">Ara</button>
          <button onclick="window.Modals?.close()" class="btn btn--ghost">İptal</button>
        </div>
        
        <div id="kb-results" style="margin-top:24px"></div>
      </div>
    `;
    window.Modals?.open("Bilgi Tabanı", html);
    
    document.getElementById("kb-save")?.addEventListener("click", async () => {
      const title = document.getElementById("kb-title").value.trim();
      const content = document.getElementById("kb-content").value.trim();
      const tags = document.getElementById("kb-tags").value.split(",").map(t => t.trim()).filter(Boolean);
      
      if (!title || !content) {
        alert("Başlık ve içerik gerekli!");
        return;
      }
      
      const resp = await fetch("/api/knowledge/add", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({title, content, tags, source: "manual"})
      }).then(r => r.json());
      
      if (resp.success) {
        alert("✓ Bilgi tabanına eklendi!");
        document.getElementById("kb-title").value = "";
        document.getElementById("kb-content").value = "";
        document.getElementById("kb-tags").value = "";
      } else {
        alert("Hata: " + (resp.error || "Bilinmeyen hata"));
      }
    });
    
    document.getElementById("kb-search")?.addEventListener("click", async () => {
      const q = prompt("Aranacak kelime:");
      if (!q) return;
      
      const resp = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`).then(r => r.json());
      const results = resp.results || [];
      
      const html = results.length
        ? `<h4>Sonuçlar (${results.length}):</h4>` + results.map(r => `
            <div style="background:var(--color-surface-2);padding:12px;border-radius:8px;margin-top:10px">
              <div style="font-weight:600;margin-bottom:6px">${r.title}</div>
              <div style="font-size:13px;color:var(--color-text-muted)">${r.content}</div>
              <div style="margin-top:6px;font-size:11px;color:var(--color-accent)">
                Skor: ${r.score} · Etiketler: ${r.tags.join(", ")}
              </div>
            </div>
          `).join("")
        : "<p style='color:var(--color-text-muted);margin-top:16px'>Sonuç bulunamadı.</p>";
      
      document.getElementById("kb-results").innerHTML = html;
    });
  }
};

window.CodeDiagram = {
  show() {
    const html = `
      <div style="padding:24px;max-width:900px">
        <h2 style="margin:0 0 16px">🔀 Kod→Diyagram</h2>
        
        <div style="margin-bottom:20px">
          <label style="display:block;margin-bottom:8px;font-weight:500">Kod</label>
          <textarea id="diagram-code" rows="12" placeholder="Python, JS veya PHP kodunu yapıştır..."
                    style="width:100%;padding:10px;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:6px;color:var(--color-text);font-family:monospace;font-size:12px;resize:vertical"></textarea>
        </div>
        
        <div style="display:flex;gap:10px;margin-bottom:20px">
          <button id="diagram-generate" class="btn btn--primary">Diyagram Oluştur</button>
          <button onclick="window.Modals?.close()" class="btn btn--ghost">İptal</button>
        </div>
        
        <div id="diagram-output" style="background:var(--color-surface-2);padding:16px;border-radius:8px;min-height:100px;display:none"></div>
      </div>
    `;
    window.Modals?.open("Kod→Diyagram", html);
    
    document.getElementById("diagram-generate")?.addEventListener("click", async () => {
      const code = document.getElementById("diagram-code").value.trim();
      if (!code) {
        alert("Kod gerekli!");
        return;
      }
      
      const output = document.getElementById("diagram-output");
      output.style.display = "block";
      output.innerHTML = "<p style='color:var(--color-text-muted)'>Diyagram oluşturuluyor...</p>";
      
      const resp = await fetch("/api/diagrams/from_code", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({code, language: "auto", diagram_type: "auto"})
      }).then(r => r.json()).catch(e => ({error: e.message}));
      
      if (resp.error) {
        output.innerHTML = `<p style='color:var(--color-danger)'>Hata: ${resp.error}</p>`;
      } else {
        output.innerHTML = `
          <div style="margin-bottom:12px;font-weight:600">Mermaid Diyagram (${resp.diagram_type}):</div>
          <pre style="background:var(--color-surface);padding:12px;border-radius:6px;overflow-x:auto;font-size:11px;line-height:1.6">${resp.mermaid}</pre>
          <p style="margin-top:12px;font-size:12px;color:var(--color-text-muted)">
            Bu kodu Mermaid Live Editor'de görselleştir: <a href="https://mermaid.live" target="_blank" style="color:var(--color-accent)">mermaid.live</a>
          </p>
        `;
      }
    });
  }
};

window.UnifiedSearch = {
  show() {
    const html = `
      <div style="padding:24px;max-width:800px">
        <h2 style="margin:0 0 16px">🔍 Akıllı Arama</h2>
        
        <div style="margin-bottom:20px">
          <input id="search-query" type="text" placeholder="Tüm kaynaklarda ara..." 
                 style="width:100%;padding:12px;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:8px;color:var(--color-text);font-size:14px">
        </div>
        
        <div style="display:flex;gap:10px;margin-bottom:20px">
          <button id="search-btn" class="btn btn--primary">Ara</button>
          <button onclick="window.Modals?.close()" class="btn btn--ghost">İptal</button>
        </div>
        
        <div id="search-results"></div>
      </div>
    `;
    window.Modals?.open("Akıllı Arama", html);
    
    const search = async () => {
      const q = document.getElementById("search-query").value.trim();
      if (!q) return;
      
      const results = document.getElementById("search-results");
      results.innerHTML = "<p style='color:var(--color-text-muted)'>Aranıyor...</p>";
      
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => ({total: 0}));
      
      if (!resp.total) {
        results.innerHTML = "<p style='color:var(--color-text-muted)'>Sonuç bulunamadı.</p>";
        return;
      }
      
      let html = `<div style="margin-bottom:12px;font-weight:600">${resp.total} sonuç bulundu</div>`;
      
      ["chats", "knowledge", "files", "code", "projects"].forEach(src => {
        const items = resp[src] || [];
        if (items.length) {
          html += `<h4 style="margin-top:16px;margin-bottom:8px;text-transform:capitalize">${src} (${items.length})</h4>`;
          items.forEach(item => {
            html += `<div style="background:var(--color-surface-2);padding:10px;border-radius:6px;margin-bottom:8px;font-size:13px">`;
            if (item.title) html += `<div style="font-weight:600;margin-bottom:4px">${item.title}</div>`;
            if (item.content) html += `<div style="color:var(--color-text-muted)">${item.content}</div>`;
            if (item.line) html += `<code style="font-size:11px">${item.line}</code>`;
            html += `</div>`;
          });
        }
      });
      
      results.innerHTML = html;
    };
    
    document.getElementById("search-btn")?.addEventListener("click", search);
    document.getElementById("search-query")?.addEventListener("keypress", e => {
      if (e.key === "Enter") search();
    });
  }
};

// Basit modal sistem (window.Modals zaten var ama API uyumsuz olabilir)
if (!window.Modals) {
  window.Modals = {
    open(title, content) {
      let modal = document.getElementById("app-modal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "app-modal";
        modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999";
        document.body.appendChild(modal);
      }
      modal.innerHTML = `
        <div style="background:var(--color-surface);border-radius:12px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
          ${content}
        </div>
      `;
      modal.style.display = "flex";
      modal.addEventListener("click", e => {
        if (e.target === modal) this.close();
      });
    },
    close() {
      const modal = document.getElementById("app-modal");
      if (modal) modal.style.display = "none";
    }
  };
}

// ═══ Faz 56: Otomatik Onarım UI ═══
window.AutoRepair = {
  async start() {
    const html = `
      <div style="padding:24px;max-width:700px">
        <h2 style="margin:0 0 8px">🔧 Otomatik Onarım</h2>
        <p style="color:var(--color-text-muted);margin:0 0 20px;font-size:13px">
          llama-cpp-python CPU-uyumlu sürümle yeniden kuruluyor. Bu işlem
          <strong>5-15 dakika</strong> sürebilir. İnternet bağlantısı gereklidir.
        </p>

        <div style="background:var(--color-surface-2);border-radius:8px;padding:14px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px">
            <span id="repair-stage">Başlatılıyor...</span>
            <span id="repair-percent">0%</span>
          </div>
          <div style="background:var(--color-surface);height:8px;border-radius:4px;overflow:hidden">
            <div id="repair-progress" style="background:var(--color-accent);height:100%;width:0;transition:width 0.4s"></div>
          </div>
        </div>

        <div style="background:#000;color:#0f0;padding:12px;border-radius:6px;font-family:monospace;font-size:11px;height:280px;overflow-y:auto;line-height:1.5" id="repair-log">
          Onarım başlatılıyor...
        </div>

        <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
          <button id="repair-close" class="btn btn--ghost" disabled style="opacity:0.5">
            Kapat
          </button>
        </div>
      </div>
    `;
    window.Modals?.open("Otomatik Onarım", html);

    const logEl = document.getElementById("repair-log");
    const progressEl = document.getElementById("repair-progress");
    const percentEl = document.getElementById("repair-percent");
    const stageEl = document.getElementById("repair-stage");
    const closeBtn = document.getElementById("repair-close");

    // Onarımı başlat
    try {
      const resp = await fetch("/api/repair/llama", {method: "POST"}).then(r => r.json());
      if (!resp.success) {
        logEl.innerHTML += `\n<span style="color:#f55">HATA: ${resp.error || "Onarım başlatılamadı"}</span>`;
        closeBtn.disabled = false;
        closeBtn.style.opacity = "1";
        return;
      }
    } catch(e) {
      logEl.innerHTML += `\n<span style="color:#f55">HATA: ${e.message}</span>`;
      return;
    }

    // SSE ile canlı log
    const es = new EventSource("/api/repair/stream");
    let allLines = [];
    es.onmessage = (e) => {
      const line = e.data;

      if (line.startsWith("__END__:")) {
        const status = line.replace("__END__:", "");
        es.close();
        if (status === "success") {
          stageEl.textContent = "✓ Tamamlandı";
          stageEl.style.color = "#0f0";
          percentEl.textContent = "100%";
          progressEl.style.width = "100%";
          allLines.push("\n=== ONARIM BAŞARILI ===");
          allLines.push("Uygulamayı yeniden başlatın.");
        } else {
          stageEl.textContent = "✗ Başarısız";
          stageEl.style.color = "#f55";
          allLines.push("\n=== ONARIM BAŞARISIZ ===");
        }
        logEl.innerHTML = allLines.map(l => l.replace("<", "&lt;")).join("\n");
        logEl.scrollTop = logEl.scrollHeight;
        closeBtn.disabled = false;
        closeBtn.style.opacity = "1";
        return;
      }

      allLines.push(line);
      logEl.innerHTML = allLines.map(l => l.replace("<", "&lt;")).join("\n");
      logEl.scrollTop = logEl.scrollHeight;

      // Aşama tespiti
      if (line.includes("Adim 1")) {
        stageEl.textContent = "Adım 1/3: Kaldırma";
        progressEl.style.width = "15%";
        percentEl.textContent = "15%";
      } else if (line.includes("Adim 2")) {
        stageEl.textContent = "Adım 2/3: Kurulum";
        progressEl.style.width = "50%";
        percentEl.textContent = "50%";
      } else if (line.includes("Adim 3") || line.includes("Test")) {
        stageEl.textContent = "Adım 3/3: Test";
        progressEl.style.width = "85%";
        percentEl.textContent = "85%";
      }
    };

    es.onerror = () => {
      es.close();
      closeBtn.disabled = false;
      closeBtn.style.opacity = "1";
    };

    closeBtn.addEventListener("click", () => window.Modals?.close());
  }
};
