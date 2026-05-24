/* ============================================================
   CODEGA AI - Self-Learning (Faz 7)
   ============================================================ */

const Learning = (() => {

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  async function refreshMemoryStats() {
    try {
      const memoryStats = await fetch("/api/memory/stats").then(r => {
        if (!r.ok) throw new Error("memory stats HTTP " + r.status);
        return r.json();
      });
      document.getElementById("mem-working").textContent =
        memoryStats.working_memory_messages || 0;
      document.getElementById("mem-archive").textContent =
        memoryStats.archive_documents || 0;
      document.getElementById("mem-core").textContent =
        memoryStats.core_facts || 0;
    } catch (err) {
      console.error("Memory stats refresh:", err);
      for (const id of ["mem-working", "mem-archive", "mem-core"]) {
        const node = document.getElementById(id);
        if (node) node.textContent = "0";
      }
    }
  }

  async function refreshStats() {
    await refreshMemoryStats();

    try {
      // Feedback istatistikleri
      const stats = await fetch("/api/learning/stats").then(r => r.json());
      const ds = await fetch("/api/learning/dataset?min_pairs=4").then(r => r.json());
      const adapters = await fetch("/api/learning/adapters").then(r => r.json());
      const deps = await fetch("/api/learning/dependencies").then(r => r.json());

      document.getElementById("lstat-likes").textContent = stats.likes || 0;
      document.getElementById("lstat-dislikes").textContent = stats.dislikes || 0;
      document.getElementById("lstat-pairs").textContent = ds.pair_count || 0;
      document.getElementById("lstat-adapters").textContent =
        (adapters.adapters || []).length;

      // Eğitim hazır mı?
      const trainBtn = document.getElementById("learning-train-btn");
      const depsLabel = document.getElementById("learning-deps");

      if (!deps.ready) {
        trainBtn.disabled = true;
        depsLabel.innerHTML = `Eğitim için eksik kütüphaneler: ` +
          `<code>${escapeHTML(deps.missing.join(", "))}</code>. ` +
          `Kurulum: <code>${escapeHTML(deps.install_command)}</code>`;
        depsLabel.className = "learning-deps learning-deps--err";
      } else if (!ds.ready_for_training) {
        trainBtn.disabled = true;
        depsLabel.textContent =
          `${ds.pair_count}/${ds.min_required} tercih çifti. ` +
          `Daha fazla 👍/👎 toplandıktan sonra aktif olur.`;
        depsLabel.className = "learning-deps";
      } else {
        trainBtn.disabled = false;
        depsLabel.textContent = `Hazır: ${ds.pair_count} tercih çifti.`;
        depsLabel.className = "learning-deps learning-deps--ok";
      }

      // Adapter listesi
      renderAdapters(adapters);
    } catch (err) {
      console.error("Learning refresh:", err);
    }
  }

  function renderAdapters(data) {
    const list = document.getElementById("adapters-list");
    if (!list) return;

    if (!data.adapters || data.adapters.length === 0) {
      list.innerHTML = '<div class="image-gallery__empty">' +
        'Henüz adapter yok — DPO eğitimi sonrası burada listelenir</div>';
      return;
    }

    list.innerHTML = data.adapters.map(a => {
      const activeClass = a.active ? " adapter-card--active" : "";
      const actionBtn = a.active
        ? `<button class="btn btn--ghost btn--small"
            onclick="Learning.deactivate()">Devre dışı bırak</button>`
        : `<button class="btn btn--primary btn--small"
            onclick="Learning.activate('${escapeHTML(a.id)}')">Aktif et</button>`;
      return `
        <div class="adapter-card${activeClass}" data-id="${escapeHTML(a.id)}">
          <div class="adapter-card__header">
            <div>
              <div class="adapter-card__name">${escapeHTML(a.name)}
                ${a.active ? '<span class="badge">Aktif</span>' : ''}</div>
              <div class="adapter-card__id">${escapeHTML(a.id)}</div>
            </div>
            <div class="adapter-card__meta">
              <span><strong>${a.size_mb.toFixed(1)} MB</strong></span>
              <span>taban: ${escapeHTML(a.base_model)}</span>
            </div>
          </div>
          ${a.description
            ? `<div class="adapter-card__desc">${escapeHTML(a.description)}</div>`
            : ''}
          <div class="adapter-card__actions">
            ${actionBtn}
            <button class="btn btn--ghost btn--danger btn--small"
              onclick="Learning.del('${escapeHTML(a.id)}')">Sil</button>
          </div>
        </div>
      `;
    }).join("");
  }

  async function activate(adapterId) {
    try {
      await fetch("/api/learning/adapters/activate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({adapter_id: adapterId}),
      });
      refreshStats();
    } catch (err) {
      alert("Adapter aktif edilemedi: " + err.message);
    }
  }

  async function deactivate() {
    try {
      await fetch("/api/learning/adapters/activate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({adapter_id: null}),
      });
      refreshStats();
    } catch (err) {
      alert("Adapter devre dışı bırakılamadı: " + err.message);
    }
  }

  async function del(adapterId) {
    if (!confirm("Adapter'i sil?")) return;
    try {
      await fetch(`/api/learning/adapters/${adapterId}`, {method: "DELETE"});
      refreshStats();
    } catch (err) {
      alert("Silme başarısız: " + err.message);
    }
  }

  async function startTraining() {
    const name = prompt("Yeni adapter için bir ad ver:", "Yunus tercihleri");
    if (!name) return;

    const status = document.getElementById("learning-status");
    status.textContent = "DPO eğitimi başlatılıyor...";
    status.className = "image-status image-status--working";

    try {
      const data = await fetch("/api/learning/train", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          base_model_id: "qwen3-4b-q4_k_m",
          adapter_name: name,
          epochs: 1,
          learning_rate: 5e-5,
        }),
      }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));

      status.textContent = `Eğitim başladı: ${data.job_id} (${data.pairs} çift)`;
      status.className = "image-status image-status--ok";
      pollStatus();
    } catch (err) {
      const msg = err.detail || err.message || JSON.stringify(err);
      status.textContent = "Hata: " + msg;
      status.className = "image-status image-status--err";
    }
  }

  async function pollStatus() {
    const status = document.getElementById("learning-status");
    let count = 0;
    const timer = setInterval(async () => {
      count++;
      try {
        const data = await fetch("/api/learning/status").then(r => r.json());
        if (data.state === "completed") {
          clearInterval(timer);
          status.textContent = `✓ ${data.message}`;
          status.className = "image-status image-status--ok";
          refreshStats();
        } else if (data.state === "error") {
          clearInterval(timer);
          status.textContent = "Hata: " + (data.error || "?");
          status.className = "image-status image-status--err";
        } else if (data.state === "training") {
          status.textContent =
            `Eğitim sürüyor: ${(data.progress * 100).toFixed(0)}% — ${data.message}`;
        }
      } catch (e) {
        console.error("status poll error:", e);
      }
      if (count > 600) clearInterval(timer);  // 10 dk sonra durdur
    }, 1000);
  }

  function init() {
    const btn = document.getElementById("learning-train-btn");
    if (!btn) return;

    btn.addEventListener("click", startTraining);

    Views.on((name) => {
      if (name === "memory") {
        refreshStats();
      }
    });
  }

  return { init, refreshStats, activate, deactivate, del };
})();

window.Learning = Learning;
