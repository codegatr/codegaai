/* ============================================================
   CODEGA AI - Sistem sayfası (sifirdan)
   ============================================================ */
const System = (() => {
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function el(id) { return document.getElementById(id); }
  function setText(id, v) { const e=el(id); if(e) e.textContent=v; }

  async function get(path, timeoutMs = 45000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Sunucu hazirlaniyor; yanit gecikti. Biraz sonra Yenile."));
      }, timeoutMs);
    });
    const request = fetch(path)
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch(e => {
        const msg = String(e?.message || e || "");
        if (e?.name === "AbortError" || msg.includes("signal is aborted")) {
          throw new Error("Sunucu hazirlaniyor; istek zaman asimina ugradi.");
        }
        throw e;
      })
      .finally(() => clearTimeout(timer));
    return Promise.race([request, timeout]);
  }

  async function post(path, body) {
    const r = await fetch(path, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body ?? {})
    });
    return r.json();
  }

  // ── Donanım ──
  async function loadHardware() {
    const box = el("system-table");
    if (!box) return;
    box.innerHTML = "Kontrol ediliyor...";
    try {
      const d = await get("/api/system/check");
      const pill = el("system-overall");
      if (pill) {
        const m = {ok:"status-pill--ok", warn:"status-pill--warn", fail:"status-pill--err"};
        pill.className = "status-pill " + (m[d.overall]||"");
        pill.innerHTML = `<span class="status-pill__dot"></span>${
          d.overall==="ok"?"Sistem hazır":d.overall==="warn"?"Uyarı var":"Sorun var"}`;
      }
      box.innerHTML = (d.results||[]).map(r=>`
        <div class="system-row">
          <span class="system-row__icon">${r.status==="ok"?"✓":r.status==="warn"?"⚠":"✗"}</span>
          <span class="system-row__name">${esc(r.name)}</span>
          <span class="system-row__msg">${esc(r.message)}</span>
        </div>`).join("") || "Sonuç yok";
    } catch(e) {
      box.innerHTML = `<span style="color:#ef4444">Hata: ${esc(e.message)}</span>`;
    }
  }

  // ── Motor Durumu ──
  async function loadEngines() {
    const box = el("engines-list");
    if (!box) return;
    box.innerHTML = "Yükleniyor...";
    try {
      const d = await get("/api/system/engines");
      const lbls = {
        llm:"LLM (Sohbet + Kod)", embedding:"Embedding", memory:"RAG Bellek",
        image:"Görsel Üretimi", audio:"Ses (TTS + ASR)", video:"Video Üretimi",
        learning:"Self-Learning", updater:"Güncelleme"
      };
      box.innerHTML = "";
      for (const [k,lbl] of Object.entries(lbls)) {
        const v = d[k]||{};
        const active = v.active||v.ready;
        const row = document.createElement("div");
        row.className = "engine-row";
        row.innerHTML = `
          <div class="engine-row__name">${esc(lbl)}</div>
          <div class="engine-row__status">
            <span class="status-pill ${active?"status-pill--ok":""}">
              <span class="status-pill__dot"></span>
              ${active?(v.model_id||"Aktif"):v.state==="loading"?"Yükleniyor...":"Beklemede"}
            </span>
          </div>`;
        box.appendChild(row);
      }
      const errBox = el("llm-error-box");
      if (errBox && d.llm?.error?.includes("AVX2")) {
        errBox.hidden = false;
        errBox.innerHTML = `<strong>⚠️ CPU AVX2 Uyumsuzluğu</strong><br>
          <code>fix_llama.bat</code> dosyasını çalıştırın.`;
      }
      // Chat altbar
            const st = el("status-engine");
      if (st) st.textContent = d.llm?.active ? `Motor: ${d.llm.model_id||""}` : "Motor: bekleniyor";
      const pill = el("chat-engine-pill");
      if (pill) {
        pill.className = "status-pill " + (d.llm?.active ? "status-pill--ok" : "");
        const sp = pill.querySelector("span:last-child");
        if (sp) sp.textContent = d.llm?.active ? (d.llm.model_id||"Hazır") : "Bekleniyor";
      }
      // Model: — → model adı göster
      const mc = el("chat-model-code");
      if (mc) mc.textContent = d.llm?.active ? (d.llm.model_id||"—") : "—";
    } catch(e) {
      box.innerHTML = `<span style="color:#ef4444">Hata: ${esc(e.message)}</span>`;
    }
  }

  // ── Diskler ──
  async function loadDisks() {
    const box = el("disk-list"); const cur = el("models-dir-current");
    if (!box) return;
    box.innerHTML = "Diskler taranıyor...";
    try {
      const d = await get("/api/system/disks");
      if (cur) cur.textContent = d.current_models_dir||"—";
      if (!d.disks?.length) { box.innerHTML='<p class="form-hint">Disk bulunamadı.</p>'; return; }
      box.innerHTML = d.disks.map(dk=>{
        const pct=dk.used_pct||0;
        const color=pct>85?"#ef4444":pct>60?"#f59e0b":"#10b981";
        const active=(d.current_models_dir||"").startsWith(dk.path);
        return `<div class="disk-item ${active?"disk-item--active":""}">
          <div class="disk-item__info">
            <strong>${esc(dk.label)}:</strong>
            <span class="form-hint">${dk.free_gb} GB boş / ${dk.total_gb} GB</span>
          </div>
          <div class="disk-bar-wrap"><div class="disk-bar" style="width:${pct}%;background:${color}"></div></div>
          <button class="btn btn--ghost" ${active?"disabled":""} onclick="System.setDisk('${dk.path}CODEGA_Models')">
            ${active?"✓ Mevcut":"Seç"}
          </button>
        </div>`;
      }).join("");
    } catch(e) { box.innerHTML=`<span style="color:#ef4444">Hata: ${esc(e.message)}</span>`; }
  }

  async function setDisk(path) {
    const res = el("models-dir-result");
    if (res) res.textContent = "Kaydediliyor...";
    try {
      const d = await post("/api/system/models-dir", {path});
      if (d.ok) { if(res) res.innerHTML=`✅ <code>${esc(d.new_path)}</code>`; loadDisks(); }
      else if(res) res.textContent="❌ "+(d.error||"Hata");
    } catch(e) { if(res) res.textContent="❌ "+e.message; }
  }

  // ── LLM Modeller ──
  const polls = {};

  async function loadModels() {
    const box = el("models-grid");
    if (!box) return;
    box.innerHTML = '<div style="padding:8px;color:var(--color-text-muted)">Modeller yükleniyor...</div>';
    try {
      const d = await get("/api/models/llm");
      const models = d.models || [];
      if (!models.length) {
        box.innerHTML = '<div style="padding:8px;color:var(--color-text-muted)">Model listesi boş.</div>';
        return;
      }
      box.innerHTML = models.map(m => {
        const dl=m.downloaded, ld=m.loaded;
        const prog=m.download||{}, pct=Math.round(prog.percent||0);
        let badge, btn;
        if (ld) {
          badge = `<span class="status-pill status-pill--ok" style="font-size:11px"><span class="status-pill__dot"></span>Yüklü</span>`;
          btn = `<button class="btn btn--ghost" style="font-size:12px" onclick="System.unloadModel('${m.id}')">Bellekten Çıkar</button>`;
        } else if (prog.status==="downloading") {
          badge = `<span class="status-pill" style="font-size:11px;border-color:#f59e0b"><span class="status-pill__dot" style="background:#f59e0b"></span>İndiriliyor %${pct}</span>`;
          btn = `<div style="margin-top:6px;height:4px;background:var(--color-border);border-radius:2px">
            <div style="height:4px;width:${pct}%;background:#f59e0b;border-radius:2px"></div></div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${(prog.downloaded_gb||0).toFixed(2)} / ${m.size_gb} GB</div>`;
        } else if (dl) {
          badge = `<span class="status-pill" style="font-size:11px"><span class="status-pill__dot"></span>İndirildi</span>`;
          btn = `<button class="btn btn--primary" style="font-size:12px" onclick="System.loadModel('${m.id}')">Yükle</button>`;
        } else {
          badge = `<span class="status-pill status-pill--off" style="font-size:11px"><span class="status-pill__dot"></span>İndirilmedi</span>`;
          btn = `<button class="btn btn--ghost" style="font-size:12px" onclick="System.downloadModel('${m.id}')">İndir (~${m.size_gb} GB)</button>`;
        }
        return `<div class="model-card" id="mc-${m.id}">
          <div class="model-card__header">
            <div>
              <div class="model-card__name">${esc(m.name||m.id)}</div>
              <div class="model-card__id">${esc(m.id)} · ${m.size_gb} GB VRAM: ${m.vram_gb} GB</div>
            </div>${badge}
          </div>
          ${m.description?`<p class="model-card__desc">${esc(m.description)}</p>`:""}
          <div class="model-card__actions" id="ma-${m.id}">${btn}
            ${m.default?'<span style="font-size:11px;color:var(--color-text-muted)">⭐ Önerilen</span>':""}
          </div>
        </div>`;
      }).join("");
    } catch(e) {
      box.innerHTML = `<div style="color:#ef4444;padding:8px">
        Modeller yüklenemedi: ${esc(e.message)}<br>
        <button class="btn btn--ghost" style="margin-top:8px;font-size:12px" onclick="System.loadModels()">Tekrar Dene</button>
      </div>`;
    }
  }

  async function downloadModel(id) {
    const ma = el("ma-"+id);
    if (ma) ma.innerHTML = '<span style="font-size:12px;color:#f59e0b">Başlatılıyor...</span>';
    try {
      await post(`/api/models/${id}/download`);
      if (polls[id]) clearInterval(polls[id]);
      polls[id] = setInterval(async()=>{
        try {
          const s = await get(`/api/models/${id}/status`);
          const dl=s.download||{}; const pct=Math.round(dl.percent||0);
          const ma2 = el("ma-"+id);
          if (!ma2) { clearInterval(polls[id]); return; }
          if (dl.status==="downloading") {
            ma2.innerHTML = `<div style="font-size:12px;color:#f59e0b">İndiriliyor: %${pct}</div>
              <div style="margin-top:4px;height:4px;background:var(--color-border);border-radius:2px">
              <div style="height:4px;width:${pct}%;background:#f59e0b;border-radius:2px;transition:width .5s"></div></div>
              <div style="font-size:11px;color:var(--color-text-muted)">${((dl.downloaded||0)/1e9).toFixed(2)} / ${s.size_gb||"?"} GB</div>`;
          } else if (s.downloaded||dl.status==="completed") {
            clearInterval(polls[id]); delete polls[id]; loadModels();
          } else if (dl.status==="error") {
            clearInterval(polls[id]); delete polls[id];
            if(ma2) ma2.innerHTML=`<span style="color:#ef4444">Hata</span>
              <button class="btn btn--ghost" style="font-size:12px;margin-left:8px" onclick="System.downloadModel('${id}')">Tekrar</button>`;
          }
        } catch(e) { clearInterval(polls[id]); delete polls[id]; }
      }, 1500);
    } catch(e) {
      if (ma) ma.innerHTML=`<button class="btn btn--ghost" style="font-size:12px" onclick="System.downloadModel('${id}')">İndir</button>`;
    }
  }

  async function loadModel(id) {
    const ma = el("ma-"+id);
    if (ma) ma.innerHTML = '<span style="font-size:12px;color:#f59e0b">Yükleniyor...</span>';
    try { await post(`/api/models/${id}/load`); setTimeout(()=>{loadModels();loadEngines();},2000); }
    catch(e) { loadModels(); }
  }

  async function unloadModel(id) {
    try { await post("/api/models/unload"); setTimeout(()=>{loadModels();loadEngines();},1000); }
    catch(e) { loadModels(); }
  }

  // ── Ayarlar ──
  async function loadLogs() {
    const pathEl = el("system-log-path");
    const linesEl = el("system-log-lines");
    if (!linesEl) return;
    try {
      const d = await get("/api/system/logs?limit=100");
      if (pathEl) pathEl.textContent = d.exists ? d.path : `Log dosyası henüz oluşmadı: ${d.path}`;
      const lines = d.lines || [];
      linesEl.textContent = lines.length ? lines.join("\n") : "Henüz log kaydı yok.";
      linesEl.scrollTop = linesEl.scrollHeight;
    } catch(e) {
      if (pathEl) pathEl.textContent = "Loglar okunamadı";
      linesEl.textContent = "Hata: " + e.message;
    }
  }

  async function loadSettings() {
    try {
      const d = await get("/api/system/info");
      setText("settings-version", `v${d.version||"?"}`);
      setText("settings-phase", d.phase||"");
      setText("brand-version", `v${d.version||"?"}`);
      const llm = el("settings-llm");
      if (llm) llm.textContent = d.models?.llm||"—";
    } catch(e) {}
  }

  // ── Init ──
  function loadAll() {
    loadHardware();
    loadEngines();
    loadDisks();
    loadModels();
    loadLogs();
  }

  function startClock() {
    const e = el("status-time"); if(!e) return;
    const tick=()=>{ e.textContent=new Date().toLocaleTimeString("tr-TR",{hour12:false}); };
    tick(); setInterval(tick,1000);
  }

  function init() {
    el("system-refresh")?.addEventListener("click", loadAll);
    el("set-models-dir-btn")?.addEventListener("click", ()=>{
      const v=el("custom-models-dir")?.value?.trim(); if(v) setDisk(v);
    });

    if (typeof Views !== "undefined") {
      Views.on(name => {
        if (name === "system") loadAll();
        if (name === "settings") loadHfTokenStatus();
      });
    }

    loadSettings();
    loadHfTokenStatus();
    loadEngines();  // chat pill

    // İlk açılışta sistem sekmesi zaten açıksa veya 1sn sonra kontrol
    setTimeout(()=>{
      if (typeof Views!=="undefined" && Views.current()==="system") loadAll();
    }, 800);

    startClock();
  }

  return { init, loadModels, loadEngines, loadAll, loadLogs,
           downloadModel, loadModel, unloadModel, setDisk,
           refresh: loadAll };
})();

window.System = System;

// HuggingFace Token
async function loadHfTokenStatus() {
  try {
    const r = await fetch("/api/system/hf-token");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const status = document.getElementById("hf-token-status");
    if (status) {
      status.textContent = d.has_token
        ? `✓ Token aktif: ${d.preview}`
        : "Token girilmemiş — indirmeler yavaş olabilir";
      status.style.color = d.has_token ? "var(--color-success)" : "var(--color-text-muted)";
    }
  } catch(e) {}
}

window.saveHfToken = async function() {
  const inp = document.getElementById("hf-token-input");
  const status = document.getElementById("hf-token-status");
  const token = inp?.value?.trim();
  if (!token) { if (status) status.textContent = "Token girin"; return; }
  try {
    const r = await fetch("/api/system/hf-token", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
    if (!r.ok) { throw new Error("Sunucu hatası: " + r.status); }
    const d = await r.json();
    if (d.ok) {
      if (status) { status.textContent = "✓ Token kaydedildi"; status.style.color = "var(--color-success)"; }
      if (inp) inp.value = "";
      loadHfTokenStatus();
    }
  } catch(e) { if (status) status.textContent = "Hata: " + e.message; }
};

window.clearHfToken = async function() {
  const status = document.getElementById("hf-token-status");
  try {
    await fetch("/api/system/hf-token", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:""})});
    if (status) { status.textContent = "Token silindi"; status.style.color = "var(--color-text-muted)"; }
  } catch(e) {}
};

// ── GPU (Faz 32) ──────────────────────────────────────────────────────────
async function loadGPUStatus() {
  const box = document.getElementById("gpu-status-box");
  const enableBtn = document.getElementById("gpu-enable-btn");
  if (!box) return;
  try {
    const r = await fetch("/api/gpu/status");
    const d = await r.json();
    const driverCuda = !!d.driver_cuda_available;
    const torchCuda = !!d.torch_cuda_available;
    const llamaCuda = !!d.llama_cpp_gpu;
    const cuda = driverCuda || torchCuda;
    const color = cuda ? "var(--color-success)" : "var(--color-text-muted)";
    if (enableBtn) {
      enableBtn.disabled = !llamaCuda;
      enableBtn.title = llamaCuda ? "Modeli GPU ile yukle" : "Bu paket CPU/no-AVX. GPU icin windows-cuda paketi gerekir.";
      enableBtn.textContent = llamaCuda ? "GPU ile Yükle" : "CUDA paket gerekir";
    }
    box.innerHTML = `
      <div><b>GPU:</b> ${d.gpu_name || "Bulunamadı"}</div>
      <div><b>CUDA:</b> <span style="color:${color}">${cuda ? "✓ " + (d.cuda_version||"") : "✗ Yok"}</span></div>
      ${d.vram_total_mb ? `<div><b>VRAM:</b> ${d.vram_free_mb} MB boş / ${d.vram_total_mb} MB toplam</div>` : ""}
      <div><b>Mevcut:</b> ${d.current_gpu_layers || 0} katman GPU'da</div>
      <div style="color:var(--color-accent);font-size:12px;margin-top:4px">${d.recommendation || ""}</div>`;
  } catch(e) {
    if (box) box.innerHTML = '<span class="muted">GPU bilgisi alınamadı</span>';
  }
}

window.runGPUBenchmark = async function() {
  const btn = document.getElementById("gpu-bench-btn");
  const res = document.getElementById("gpu-bench-result");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Test yapılıyor..."; }
  try {
    const r = await fetch("/api/gpu/benchmark");
    const d = await r.json();
    if (res) res.textContent = d.error ? "❌ " + d.error
      : `⚡ ${d.tokens_per_second} token/sn (${d.tokens} token, ${d.elapsed_s}s) — ${d.backend}`;
  } catch(e) {
    if (res) res.textContent = "❌ " + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Hız Testi"; }
  }
};

window.enableGPU = async function() {
  const status = await fetch("/api/gpu/status").then(r => r.json()).catch(() => ({}));
  if (!status.llama_cpp_gpu) {
    alert("Bu kurulum CPU/no-AVX paketi. GPU kullanmak icin CODEGA AI windows-cuda paketini kurman gerekiyor.");
    return;
  }
  const layers = prompt("Kaç katman GPU'ya taşınsın? (RTX 3060 6GB için 20 önerilir)", "20");
  if (!layers) return;
  const btn = document.getElementById("gpu-enable-btn");
  if (btn) btn.disabled = true;
  try {
    const r = await fetch("/api/gpu/enable", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({n_gpu_layers: parseInt(layers)})
    });
    const d = await r.json();
    alert(d.error ? "❌ " + d.error : "✅ " + d.message);
    loadGPUStatus();
  } finally {
    if (btn) btn.disabled = false;
  }
};

// Sistem sayfasına geçince GPU yükle
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('.nav-item[data-view="system"]').forEach(btn => {
    btn.addEventListener("click", loadGPUStatus);
  });
  // İlk yükleme
  setTimeout(loadGPUStatus, 2000);
});
