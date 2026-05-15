/**
 * CODEGA AI — Eksiksiz Güncelleme Sistemi v2
 * Kontrol · İndirme · Progress · Uygulama · Yedek · Rollback · Changelog
 */
const Updater = (() => {
  let _poll = null;

  // ── Yardımcı ─────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

  // ── Kontrol ──────────────────────────────────────────────────────────
  async function check(force = false) {
    set("updater-status", "<span class='muted'>Kontrol ediliyor…</span>");
    try {
      const d = await fetch(`/api/updater/check?force=${force}`).then(r => r.json());
      _renderStatus(d); return d;
    } catch(e) {
      set("updater-status", `<span style='color:var(--color-danger)'>❌ ${e.message}</span>`);
    }
  }

  function _renderStatus(d) {
    if (d.update_available) {
      set("updater-status", `
        <div style="background:rgba(245,158,11,.1);border:1px solid var(--color-accent);
                    border-radius:8px;padding:16px">
          <div style="font-size:15px;font-weight:600;color:var(--color-accent)">
            🆕 v${d.latest_version} mevcut
          </div>
          <div style="font-size:12px;color:var(--color-text-muted);margin:4px 0">
            Mevcut: v${d.current_version} · ${d.asset_size_mb.toFixed(1)} MB
            · Kontrol: ${d.checked_at}
          </div>
          <details style="margin-top:8px">
            <summary style="cursor:pointer;font-size:12px;color:var(--color-accent)">
              Sürüm notları ▾
            </summary>
            <pre style="font-size:11px;margin-top:6px;padding:8px;background:var(--color-surface);
                        border-radius:4px;white-space:pre-wrap;max-height:120px;overflow-y:auto">
${d.release_notes || 'Yok'}</pre>
          </details>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn" onclick="Updater.download('${d.latest_version}')">
              ⬇ İndir & Güncelle
            </button>
            <button class="btn btn--ghost" onclick="Updater.showChangelog()">
              📋 Tüm Changelog
            </button>
          </div>
        </div>`);
    } else {
      set("updater-status", `
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:var(--color-success)">✅ Güncelsiniz</span>
          <strong>v${d.current_version}</strong>
          <span style="color:var(--color-text-muted);font-size:12px">
            (Kontrol: ${d.checked_at})
          </span>
          ${d.auto_update
            ? '<span style="font-size:11px;background:var(--color-surface-2);padding:2px 6px;border-radius:4px">🔄 Otomatik açık</span>'
            : ''}
        </div>`);
    }
  }

  // ── İndirme ──────────────────────────────────────────────────────────
  async function download(version = "") {
    const prog = $("updater-progress");
    if (prog) prog.style.display = "block";
    set("updater-bar-label", "İndirme başlatılıyor…");
    try {
      const d = await fetch("/api/updater/download", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({version})
      }).then(r => r.json());
      if (d.error) { alert("❌ " + d.error); return; }
      _startPoll();
    } catch(e) { alert("❌ " + e.message); }
  }

  function _startPoll() {
    clearInterval(_poll);
    _poll = setInterval(async () => {
      const d = await fetch("/api/updater/progress").then(r => r.json()).catch(() => null);
      if (!d) return;
      const bar = $("updater-bar");
      if (bar) bar.style.width = (d.percent || 0) + "%";
      if (d.status === "downloading") {
        set("updater-bar-label",
          `${d.downloaded_mb} / ${d.total_mb} MB · ${d.percent}%`);
      } else if (d.status === "completed") {
        set("updater-bar-label", `✅ v${d.version} hazır`);
        clearInterval(_poll);
        _showApply(d.version);
      } else if (d.status === "error") {
        set("updater-bar-label", `❌ ${d.error}`);
        clearInterval(_poll);
      }
      if (d.done) clearInterval(_poll);
    }, 600);
  }

  function _showApply(version) {
    const prog = $("updater-progress");
    if (!prog) return;
    const div = document.createElement("div");
    div.style.marginTop = "10px";
    div.innerHTML = `<button class="btn" onclick="Updater.apply()">
      🔄 v${version} Uygula (yeniden başlar)
    </button>`;
    prog.appendChild(div);
  }

  async function cancelDownload() {
    clearInterval(_poll);
    await fetch("/api/updater/cancel", {method:"POST"});
    const bar = $("updater-bar"); if (bar) bar.style.width = "0";
    set("updater-bar-label", "İptal edildi");
  }

  // ── Uygula ───────────────────────────────────────────────────────────
  async function apply() {
    if (!confirm("Güncelleme uygulanacak ve uygulama yeniden başlayacak. Devam?")) return;
    const d = await fetch("/api/updater/apply",{method:"POST"}).then(r=>r.json());
    if (d.error) alert("❌ " + d.error);
    else alert("✅ " + (d.message || "Yeniden başlatılıyor…"));
  }

  // ── Yedek ────────────────────────────────────────────────────────────
  async function createBackup() {
    const label = prompt("Yedek etiketi (boş bırakılabilir):");
    if (label === null) return;
    const d = await fetch("/api/updater/backup",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({label})
    }).then(r=>r.json());
    d.error ? alert("❌ "+d.error) : alert(`✅ ${d.file} (${d.size_mb} MB)`);
    loadBackups();
  }

  async function loadBackups() {
    const d = await fetch("/api/updater/backups").then(r=>r.json()).catch(()=>({backups:[]}));
    if (!d.backups?.length) {
      set("updater-backups",'<div class="muted" style="font-size:13px">Yedek yok</div>'); return;
    }
    set("updater-backups", d.backups.map(b => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
                  background:var(--color-surface-2);border-radius:6px;margin-bottom:4px;font-size:13px">
        <span>📦</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
              title="${b.name}">${b.name}</span>
        <span style="color:var(--color-text-muted);white-space:nowrap">
          ${b.size_mb} MB · ${b.created}
        </span>
        <button onclick="Updater.rollback('${b.name}')"
          style="font-size:11px;padding:2px 8px;border:1px solid var(--color-danger);
                 border-radius:4px;background:none;color:var(--color-danger);cursor:pointer">
          ↩ Geri Dön
        </button>
      </div>`).join(""));
  }

  async function rollback(name = "") {
    if (!confirm(`"${name || 'en son yedek'}" yedeğine geri dönülecek. Emin misiniz?`)) return;
    const d = await fetch("/api/updater/rollback",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({backup_name:name})
    }).then(r=>r.json());
    d.error ? alert("❌ "+d.error) : alert("✅ "+d.message);
  }

  // ── Changelog ────────────────────────────────────────────────────────
  async function showChangelog() {
    const box = $("updater-changelog");
    if (!box) return;
    box.style.display = box.style.display === "none" ? "block" : "none";
    if (box.style.display === "none") return;
    box.innerHTML = "<span class='muted' style='font-size:13px'>Yükleniyor…</span>";
    const d = await fetch("/api/updater/changelog?limit=8").then(r=>r.json()).catch(()=>({releases:[]}));
    if (!d.releases?.length) { box.innerHTML = d.error ? `❌ ${d.error}` : "Changelog bulunamadı"; return; }
    box.innerHTML = d.releases.map(r => `
      <div style="margin-bottom:10px;padding:10px;background:var(--color-surface-2);
                  border-radius:6px;border-left:3px solid var(--color-accent)">
        <div style="font-weight:600;color:var(--color-accent)">
          ${r.version}
          <span style="font-weight:400;font-size:11px;color:var(--color-text-muted);margin-left:8px">
            ${r.date}
          </span>
        </div>
        <div style="font-size:12px;margin-top:4px;color:var(--color-text-muted);
                    white-space:pre-wrap">${(r.notes||'Sürüm notu yok').slice(0,200)}</div>
      </div>`).join("");
  }

  // ── Geçmiş ───────────────────────────────────────────────────────────
  async function loadHistory() {
    const d = await fetch("/api/updater/history").then(r=>r.json()).catch(()=>({history:[]}));
    if (!d.history?.length) {
      set("updater-history",'<div class="muted" style="font-size:13px">Geçmiş yok</div>'); return;
    }
    set("updater-history", d.history.slice(0,8).map(h => `
      <div style="display:grid;grid-template-columns:130px 140px 80px 1fr;
                  gap:6px;font-size:12px;padding:4px 0;
                  border-bottom:1px solid var(--color-border)">
        <span style="color:var(--color-text-muted)">${h.ts}</span>
        <span style="color:var(--color-accent)">${h.event}</span>
        <span>${h.version}</span>
        <span style="color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis">${h.detail||''}</span>
      </div>`).join(""));
  }

  // ── Otomatik ─────────────────────────────────────────────────────────
  async function setAutoUpdate(enabled) {
    const d = await fetch("/api/updater/auto",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({enabled, check_interval_hours:6})
    }).then(r=>r.json());
    const lbl = $("auto-update-label");
    if (lbl) lbl.textContent = d.auto_update ? "Otomatik: açık (6 saatte bir)" : "Otomatik: kapalı";
    const cb = $("auto-update-cb");
    if (cb) cb.checked = !!d.auto_update;
  }

  // ── Bekleyen bildirim ─────────────────────────────────────────────────
  async function checkPending() {
    const d = await fetch("/api/updater/pending").then(r=>r.json()).catch(()=>({pending:false}));
    const badge = $("update-badge");
    const txt   = $("update-badge-text");
    if (badge) badge.hidden = !d.pending;
    if (txt && d.pending) txt.textContent = `v${d.version} hazır`;
  }

  // ── Init ─────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    check();
    loadBackups();
    loadHistory();
    setInterval(checkPending, 30 * 60 * 1000);
    checkPending();
    document.querySelectorAll('[data-view="system"]').forEach(btn =>
      btn.addEventListener("click", () => { check(); loadBackups(); loadHistory(); })
    );
  });

  return { check, download, cancelDownload, apply,
           createBackup, loadBackups, rollback,
           showChangelog, loadHistory, setAutoUpdate };
})();
