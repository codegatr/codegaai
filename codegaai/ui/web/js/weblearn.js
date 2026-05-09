/* ============================================================
   CODEGA AI - İnternet Öğrenmesi (Faz 10)
   ============================================================ */

const WebLearn = (() => {

  let elStatus, elTopicInput, elSearchBtn, elFeedBtn, elCancelBtn;
  let elLog, elFeeds, elFeedUrl, elFeedName, elFeedAdd;
  let elScheduler, elJobList;
  let pollTimer = null;

  // ---------- Durum ----------

  async function loadStatus() {
    try {
      const r = await fetch("/api/learn/status");
      const d = await r.json();
      renderStatus(d);
      if (d.state !== "idle") startPoll();
      else stopPoll();
    } catch (e) {}
  }

  function renderStatus(d) {
    if (!elStatus) return;
    const stateLabel = {
      idle: "✓ Bekliyor",
      searching: "🔍 Aranıyor...",
      crawling: "📄 Sayfalar okunuyor...",
      storing: "💾 Kaydediliyor...",
    }[d.state] || d.state;

    elStatus.innerHTML = `
      <div class="learn-stat">
        <span class="learn-stat__label">Durum</span>
        <span class="learn-stat__val learn-stat--${d.state}">${stateLabel}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Toplam Öğrenilen</span>
        <span class="learn-stat__val">${d.total_learned || 0} belge</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Son Konular</span>
        <span class="learn-stat__val">${(d.last_topics || []).join(", ") || "—"}</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__label">Son Çalışma</span>
        <span class="learn-stat__val">${d.last_run ? new Date(d.last_run * 1000).toLocaleString("tr-TR") : "—"}</span>
      </div>
    `;

    if (elCancelBtn) elCancelBtn.hidden = d.state === "idle";
    if (elSearchBtn) elSearchBtn.disabled = d.state !== "idle";
    if (elFeedBtn) elFeedBtn.disabled = d.state !== "idle";
  }

  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(loadStatus, 1500);
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ---------- Web Araması ----------

  async function doSearch() {
    const query = elTopicInput ? elTopicInput.value.trim() : "";
    if (!query) return;

    elSearchBtn.disabled = true;
    elSearchBtn.textContent = "Aranıyor...";
    try {
      const r = await fetch("/api/learn/search", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({query, max_results: 5, crawl: true, store: true}),
      });
      const d = await r.json();
      const count = d.stored || 0;
      showToast(`"${query}" için ${count} belge öğrenildi`, "success");
      loadLog();
      loadStatus();
    } catch (e) {
      showToast("Arama hatası: " + e.message, "error");
    } finally {
      elSearchBtn.disabled = false;
      elSearchBtn.textContent = "Ara + Öğren";
    }
  }

  // ---------- Konu Listesi ----------

  async function doLearnTopics() {
    const raw = elTopicInput ? elTopicInput.value.trim() : "";
    if (!raw) return;
    const topics = raw.split(",").map(t => t.trim()).filter(Boolean);
    if (!topics.length) return;

    try {
      await fetch("/api/learn/topics", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({topics, crawl: true, store: true}),
      });
      showToast(`${topics.length} konu öğrenmeye başlandı`, "info");
      startPoll();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  // ---------- Feed Beslemesi ----------

  async function doFeedLearn() {
    if (elFeedBtn) { elFeedBtn.disabled = true; elFeedBtn.textContent = "Besleniyor..."; }
    try {
      await fetch("/api/learn/feeds", {method: "POST"});
      showToast("RSS feed beslemesi başlatıldı", "info");
      startPoll();
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    } finally {
      if (elFeedBtn) { elFeedBtn.disabled = false; elFeedBtn.textContent = "Feed Besle"; }
    }
  }

  async function doCancel() {
    await fetch("/api/learn/cancel", {method: "POST"});
    showToast("İptal edildi", "warn");
    loadStatus();
  }

  // ---------- Log ----------

  async function loadLog() {
    try {
      const r = await fetch("/api/learn/log?limit=20");
      const d = await r.json();
      renderLog(d.log || []);
    } catch (e) {}
  }

  function renderLog(entries) {
    if (!elLog) return;
    if (!entries.length) {
      elLog.innerHTML = "<p class='form-hint'>Henüz öğrenme kaydı yok.</p>";
      return;
    }
    elLog.innerHTML = entries.map(e => `
      <div class="learn-log-entry">
        <span class="learn-log-entry__time">
          ${new Date(e.ts * 1000).toLocaleString("tr-TR")}
        </span>
        <span class="learn-log-entry__topics">
          ${(e.topics || []).join(", ") || "Feed"}
        </span>
        <span class="learn-log-entry__count">+${e.stored || 0}</span>
      </div>
    `).join("");
  }

  // ---------- Feed Yönetimi ----------

  async function loadFeeds() {
    try {
      const r = await fetch("/api/learn/feeds");
      const d = await r.json();
      renderFeeds(d.feeds || []);
    } catch (e) {}
  }

  function renderFeeds(feeds) {
    if (!elFeeds) return;
    if (!feeds.length) {
      elFeeds.innerHTML = "<p class='form-hint'>Feed kaynağı yok.</p>";
      return;
    }
    elFeeds.innerHTML = feeds.map((f, i) => `
      <div class="feed-item ${f.enabled ? "feed-item--on" : "feed-item--off"}">
        <div class="feed-item__info">
          <strong>${escapeHTML(f.name)}</strong>
          <span class="form-hint">${escapeHTML(f.category)} · ${f.type}</span>
          <span class="form-hint" title="${escapeHTML(f.url)}">${escapeHTML(f.url.slice(0, 50))}${f.url.length > 50 ? "…" : ""}</span>
        </div>
        <div class="feed-item__actions">
          <button class="btn btn--ghost" onclick="WebLearn.toggleFeed(${i}, ${!f.enabled})">
            ${f.enabled ? "Pasif" : "Aktif"}
          </button>
          <button class="btn btn--ghost" style="color:var(--color-danger)" onclick="WebLearn.deleteFeed(${i})">
            Sil
          </button>
        </div>
      </div>
    `).join("");
  }

  async function addFeed() {
    const name = elFeedName ? elFeedName.value.trim() : "";
    const url = elFeedUrl ? elFeedUrl.value.trim() : "";
    if (!name || !url) { showToast("Ad ve URL zorunlu", "warn"); return; }

    try {
      await fetch("/api/learn/feeds/add", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name, url, type: "rss", category: "genel"}),
      });
      if (elFeedName) elFeedName.value = "";
      if (elFeedUrl) elFeedUrl.value = "";
      loadFeeds();
      showToast("Feed eklendi", "success");
    } catch (e) {
      showToast("Hata: " + e.message, "error");
    }
  }

  async function toggleFeed(index, enabled) {
    await fetch(`/api/learn/feeds/${index}/toggle`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({enabled}),
    });
    loadFeeds();
  }

  async function deleteFeed(index) {
    if (!confirm("Feed silinsin mi?")) return;
    await fetch(`/api/learn/feeds/${index}`, {method: "DELETE"});
    loadFeeds();
    showToast("Silindi", "warn");
  }

  // ---------- Zamanlayıcı ----------

  async function loadScheduler() {
    try {
      const r = await fetch("/api/learn/scheduler");
      const d = await r.json();
      renderScheduler(d.jobs || []);
    } catch (e) {}
  }

  function renderScheduler(jobs) {
    if (!elJobList) return;
    elJobList.innerHTML = jobs.map(j => `
      <div class="feed-item ${j.enabled ? "feed-item--on" : "feed-item--off"}">
        <div class="feed-item__info">
          <strong>${escapeHTML(j.name)}</strong>
          <span class="form-hint">
            ${j.run_count} çalışma
            ${j.last_run ? "· son: " + new Date(j.last_run*1000).toLocaleString("tr-TR") : ""}
            ${j.last_error ? "· ⚠ " + escapeHTML(j.last_error.slice(0, 50)) : ""}
          </span>
          <span class="form-hint">
            ${j.next_run ? "Sıradaki: " + new Date(j.next_run*1000).toLocaleString("tr-TR") : "Zamanlanmamış"}
          </span>
        </div>
        <div class="feed-item__actions">
          <button class="btn btn--ghost"
            onclick="WebLearn.runJobNow('${j.id}')">Şimdi Çalıştır</button>
          <button class="btn btn--ghost"
            onclick="WebLearn.toggleJob('${j.id}', ${!j.enabled})">
            ${j.enabled ? "Pasif" : "Aktif"}
          </button>
        </div>
      </div>
    `).join("");
  }

  async function runJobNow(jobId) {
    await fetch(`/api/learn/scheduler/${jobId}/run`, {method: "POST"});
    showToast("Görev başlatıldı", "info");
    setTimeout(loadScheduler, 2000);
  }

  async function toggleJob(jobId, enabled) {
    await fetch(`/api/learn/scheduler/${jobId}/toggle`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({enabled}),
    });
    loadScheduler();
  }

  // ---------- Yardımcılar ----------

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  function showToast(msg, type = "info") {
    // Varsa sistem toast'ını kullan
    if (window.showToast) { window.showToast(msg, type); return; }
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:80px;right:24px;padding:12px 20px;
      border-radius:8px;z-index:9999;font-size:13px;
      background:${type==="success"?"#10b981":type==="error"?"#ef4444":"#f59e0b"};
      color:#0a0b0d;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ---------- Init ----------

  function init() {
    elStatus = document.getElementById("web-learn-status");
    elTopicInput = document.getElementById("web-learn-input");
    elSearchBtn = document.getElementById("web-learn-search-btn");
    elFeedBtn = document.getElementById("web-learn-feed-btn");
    elCancelBtn = document.getElementById("web-learn-cancel-btn");
    elLog = document.getElementById("web-learn-log");
    elFeeds = document.getElementById("web-learn-feeds");
    elFeedUrl = document.getElementById("web-learn-feed-url");
    elFeedName = document.getElementById("web-learn-feed-name");
    elFeedAdd = document.getElementById("web-learn-feed-add");
    elScheduler = document.getElementById("web-learn-scheduler");
    elJobList = document.getElementById("web-learn-jobs");

    if (!elStatus) return;

    if (elSearchBtn) {
      elSearchBtn.addEventListener("click", doSearch);
    }

    if (elTopicInput) {
      elTopicInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          doLearnTopics();
        }
      });
    }

    if (elFeedBtn) elFeedBtn.addEventListener("click", doFeedLearn);
    if (elCancelBtn) elCancelBtn.addEventListener("click", doCancel);
    if (elFeedAdd) elFeedAdd.addEventListener("click", addFeed);

    loadStatus();
    loadLog();
    loadFeeds();
    loadScheduler();
  }

  return {
    init, loadStatus, runJobNow, toggleJob, toggleFeed, deleteFeed,
  };
})();

window.WebLearn = WebLearn;
