/* ============================================================
   CODEGA AI - Akıllı Güncelleme (Faz 8)
   ============================================================ */

const Updater = (() => {
  let badge, badgeText;
  let modal, modalX, modalClose, modalBackdrop;
  let modalIcon, modalHeading;
  let elCurVer, elLatestVer, elSize, elNotes, elNotesWrap;
  let elProgress, elProgressFill, elProgressLabel, elStatus, elHelp;
  let btnDownload, btnApply, btnOpenFolder, btnCancel, btnClose;

  let state = {
    info: null,         // /check sonucu
    download: null,     // /status sonucu
    pollTimer: null,
  };

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtBytes(n) {
    if (!n) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
    return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  // ---------- Check ----------

  async function checkForUpdates(force = false) {
    try {
      const r = await fetch(`/api/updater/check?force=${force ? "true" : "false"}`);
      const data = await r.json();
      state.info = data;

      if (data.update_available) {
        badge.hidden = false;
        badgeText.textContent = `${data.latest_version} mevcut`;
      } else {
        badge.hidden = true;
      }
      return data;
    } catch (err) {
      console.error("Update check error:", err);
      return null;
    }
  }

  // ---------- Modal ----------

  async function openModal() {
    modal.hidden = false;
    document.body.classList.add("modal-open");

    // Status fetch + check güncelle
    const [info, status] = await Promise.all([
      checkForUpdates(true),
      fetch("/api/updater/status").then(r => r.json()),
    ]);

    state.download = status;
    renderModal();
    if (status.state === "downloading") startPolling();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    stopPolling();
  }

  function renderModal() {
    const info = state.info || {};
    const dl = state.download || {};

    elCurVer.textContent = info.current_version || dl.current_version || "—";
    elLatestVer.textContent = info.latest_version || "?";
    elSize.textContent = info.asset_size
      ? `(${fmtBytes(info.asset_size)})` : "";

    if (info.release_notes) {
      elNotesWrap.hidden = false;
      elNotes.textContent = info.release_notes;
    } else {
      elNotesWrap.hidden = true;
    }

    // Hangi butonlar görünür?
    btnDownload.hidden = true;
    btnApply.hidden = true;
    btnOpenFolder.hidden = true;
    btnCancel.hidden = true;
    elProgress.hidden = true;

    if (info.error) {
      modalIcon.textContent = "⚠️";
      modalHeading.textContent = "Kontrol Hatası";
      elStatus.textContent = "Hata: " + info.error;
      elStatus.className = "image-status image-status--err";
      btnDownload.hidden = true;
    } else if (!info.update_available && dl.state === "idle") {
      modalIcon.textContent = "✓";
      modalHeading.textContent = "Güncelsiniz";
      elStatus.textContent =
        `En son sürümü kullanıyorsunuz (v${info.current_version}).`;
      elStatus.className = "image-status image-status--ok";
    } else if (dl.state === "downloading") {
      modalIcon.textContent = "⬇️";
      modalHeading.textContent = "İndiriliyor...";
      elStatus.textContent = `${fmtBytes(dl.downloaded)} / ${fmtBytes(dl.total)}`;
      elStatus.className = "image-status image-status--working";
      elProgress.hidden = false;
      elProgressFill.style.width = (dl.percent || 0) + "%";
      elProgressLabel.textContent = (dl.percent || 0).toFixed(1) + "%";
      btnCancel.hidden = false;
    } else if (dl.state === "ready") {
      modalIcon.textContent = "📦";
      modalHeading.textContent = "İndirme Tamam";
      elStatus.textContent = `Sürüm v${dl.version} indirildi. Uygulamak için ` +
        `'Otomatik Uygula' butonu uygulamayı yeniden başlatır.`;
      elStatus.className = "image-status image-status--ok";
      btnApply.hidden = !dl.can_apply;
      btnOpenFolder.hidden = false;
      if (!dl.can_apply) {
        elHelp.innerHTML = `<strong>Not:</strong> Otomatik güncelleme sadece .exe ` +
          `sürümünde çalışır. Klasörü aç → eski sürümün üzerine kopyala.`;
      }
    } else if (dl.state === "applying") {
      modalIcon.textContent = "⚙️";
      modalHeading.textContent = "Uygulanıyor...";
      elStatus.textContent = "Uygulama 5 saniye içinde kapanacak ve " +
        "yeni sürüm açılacak. Bu pencereyi kapatabilirsiniz.";
      elStatus.className = "image-status image-status--working";
    } else if (dl.state === "error") {
      modalIcon.textContent = "❌";
      modalHeading.textContent = "Hata";
      elStatus.textContent = "Hata: " + (dl.error || "?");
      elStatus.className = "image-status image-status--err";
      btnDownload.hidden = false;  // Tekrar dene
    } else if (info.update_available) {
      modalIcon.textContent = "🚀";
      modalHeading.textContent = "Yeni sürüm hazır";
      elStatus.textContent =
        `v${info.current_version} → v${info.latest_version}`;
      elStatus.className = "image-status";
      btnDownload.hidden = false;
    }
  }

  // ---------- Actions ----------

  async function startDownload() {
    if (!state.info || !state.info.latest_version) return;
    btnDownload.disabled = true;
    try {
      await fetch("/api/updater/download", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({version: state.info.latest_version}),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(e));
        return r.json();
      });
      // Polling başlat
      startPolling();
    } catch (err) {
      const msg = err.detail || err.message || JSON.stringify(err);
      elStatus.textContent = "İndirme başlatılamadı: " + msg;
      elStatus.className = "image-status image-status--err";
    } finally {
      btnDownload.disabled = false;
    }
  }

  async function cancelDownload() {
    try {
      await fetch("/api/updater/cancel", {method: "POST"});
      stopPolling();
      // Hemen durumu yenile
      const status = await fetch("/api/updater/status").then(r => r.json());
      state.download = status;
      renderModal();
    } catch (err) {
      console.error("cancel error:", err);
    }
  }

  async function applyUpdate() {
    if (!confirm(
      "Uygulama yeniden başlatılacak ve güncelleme uygulanacak.\n" +
      "Açık çalışmalar kaybolabilir.\n\nDevam edilsin mi?"
    )) return;

    btnApply.disabled = true;
    btnApply.textContent = "Uygulanıyor...";
    try {
      const r = await fetch("/api/updater/apply", {method: "POST"});
      // Yanıt dönerse de hemen kapanacak — modal'ı bilgilendir
      if (r.ok) {
        const data = await r.json();
        elStatus.textContent = data.message || "Yeniden başlatılıyor...";
        elStatus.className = "image-status image-status--working";
        modalIcon.textContent = "⚙️";
        modalHeading.textContent = "Uygulanıyor...";
      } else {
        const e = await r.json();
        elStatus.textContent = "Hata: " + (e.detail || "?");
        elStatus.className = "image-status image-status--err";
      }
    } catch (err) {
      // Bağlantı koptuysa zaten çalışıyor demektir
      elStatus.textContent = "Bağlantı kesildi — uygulama yeniden başlatılıyor olabilir.";
      elStatus.className = "image-status image-status--working";
    }
  }

  async function openFolder() {
    try {
      const r = await fetch("/api/updater/install-dir").then(r => r.json());
      const path = r.extracted_dir || r.install_dir;
      if (!path) {
        alert("Klasör yolu bulunamadı.");
        return;
      }
      // UI'da modal'da yolu göster (browser doğrudan klasör açamaz)
      const text = "İndirilen yeni sürüm klasörü:\n\n" + path +
        "\n\nBu klasörün içeriğini mevcut .exe dizininin üzerine kopyalayın.\n" +
        "Yol kopyalandı 📋";
      navigator.clipboard.writeText(path).catch(() => {});
      alert(text);
    } catch (err) {
      alert("Hata: " + err.message);
    }
  }

  // ---------- Polling ----------

  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(async () => {
      try {
        const status = await fetch("/api/updater/status").then(r => r.json());
        state.download = status;
        renderModal();
        if (status.state !== "downloading") {
          stopPolling();
        }
      } catch (e) {
        // Apply'da bağlantı kopuyor — normal
        console.log("poll skip:", e);
      }
    }, 800);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  // ---------- Init ----------

  function init() {
    badge = document.getElementById("update-badge");
    badgeText = document.getElementById("update-badge-text");
    modal = document.getElementById("update-modal");
    modalX = document.getElementById("update-modal-x");
    modalClose = document.getElementById("update-modal-close");
    modalBackdrop = document.getElementById("update-modal-close");
    modalIcon = document.getElementById("update-modal-icon");
    modalHeading = document.getElementById("update-modal-heading");
    elCurVer = document.getElementById("update-current-ver");
    elLatestVer = document.getElementById("update-latest-ver");
    elSize = document.getElementById("update-size");
    elNotes = document.getElementById("update-notes");
    elNotesWrap = document.getElementById("update-notes-wrap");
    elProgress = document.getElementById("update-progress");
    elProgressFill = document.getElementById("update-progress-fill");
    elProgressLabel = document.getElementById("update-progress-label");
    elStatus = document.getElementById("update-status");
    elHelp = document.getElementById("update-help");
    btnDownload = document.getElementById("update-download-btn");
    btnApply = document.getElementById("update-apply-btn");
    btnOpenFolder = document.getElementById("update-open-folder-btn");
    btnCancel = document.getElementById("update-cancel-btn");
    btnClose = document.getElementById("update-close-btn");

    if (!badge) return;

    badge.addEventListener("click", openModal);
    modalX.addEventListener("click", closeModal);
    modalClose.addEventListener("click", closeModal);
    btnClose.addEventListener("click", closeModal);
    btnDownload.addEventListener("click", startDownload);
    btnApply.addEventListener("click", applyUpdate);
    btnOpenFolder.addEventListener("click", openFolder);
    btnCancel.addEventListener("click", cancelDownload);

    // Otomatik kontrol: sayfa açıldıktan 5 sn sonra
    setTimeout(() => checkForUpdates(false), 5000);

    // Saatte bir kontrol et
    setInterval(() => checkForUpdates(false), 60 * 60 * 1000);

    // Sürüm rakamına da tıklayarak modal aç (gizli özellik)
    const ver = document.getElementById("brand-version");
    if (ver) {
      ver.style.cursor = "pointer";
      ver.title = "Güncelleme kontrolü";
      ver.addEventListener("click", openModal);
    }
  }

  return { init, checkForUpdates, openModal };
})();

window.Updater = Updater;
