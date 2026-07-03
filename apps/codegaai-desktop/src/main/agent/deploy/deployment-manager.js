"use strict";

/**
 * deployment-manager.js — V7 Otonom Deployment omurgası.
 *
 * Sorumluluk: üretilen ZIP paketini (Software Factory çıktısı) canlı sunucuya
 * asenkron, aşama-aşama ve İZLENEBİLİR şekilde taşımak.
 *
 * Aşamalar: queued → describing → uploading → extracting → done | failed
 * Her aşama onEvent({jobId, phase, progress, detail}) ile yayınlanır — IPC bu
 * olayları renderer'a stream eder (progress bar verisi).
 *
 * Tasarım kararları (anayasa: gözlemlenebilirlik + güven):
 *  - TEK uçuş: aynı anda tek deploy (kuyruk sıralı). Yarım yükleme üstüne
 *    yükleme yok.
 *  - Paket haritası DİNAMİK: modül sayısı sabiti yok; ZIP girdilerinden
 *    taranarak türetilir (İster 3 — scannable module map).
 *  - Deploy ASLA otomatik tetiklenmez; yalnız kullanıcı eylemiyle (IPC) çağrılır
 *    ve toolPermissions.deployment "deny" ise reddedilir.
 */

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const zipEngine = require("../zip/zip-engine");
const { DirectAdminClient } = require("./directadmin-client");

/** ZIP girdilerinden dinamik modül haritası türet (hardcoded sayaç YOK). */
function scanModuleMap(entries) {
  const modules = new Map();
  for (const e of entries || []) {
    const name = String(e && e.name != null ? e.name : e).replace(/\\/g, "/");
    if (!name || name.endsWith("/")) continue;
    const top = name.includes("/") ? name.split("/")[0] : "(kök)";
    const m = modules.get(top) || { module: top, files: 0 };
    m.files += 1;
    modules.set(top, m);
  }
  return [...modules.values()].sort((a, b) => b.files - a.files);
}

class DeploymentManager {
  /**
   * @param {{getSettings:Function, clientFactory?:Function, onEvent?:Function}} deps
   *  clientFactory testlerde sahte istemci enjekte etmek için (varsayılan: DirectAdminClient).
   */
  constructor({ getSettings, clientFactory = null, onEvent = null } = {}) {
    if (typeof getSettings !== "function") throw new Error("DeploymentManager getSettings ister");
    this._getSettings = getSettings;
    this._clientFactory = clientFactory || ((cfg) => new DirectAdminClient(cfg));
    this._onEvent = typeof onEvent === "function" ? onEvent : () => {};
    this._active = null;           // {jobId,...} — tek uçuş kilidi
    this.jobs = new Map();         // jobId → son durum (gözlemlenebilirlik)
  }

  _emit(job, phase, progress, detail = "") {
    Object.assign(job, { phase, progress, detail, updatedAt: Date.now() });
    this.jobs.set(job.jobId, { ...job });
    try { this._onEvent({ ...job }); } catch (_e) {}
  }

  _clientFromSettings() {
    const s = this._getSettings() || {};
    return this._clientFactory({
      host: s.directadminHost,
      port: s.directadminPort,
      username: s.directadminUsername,
      loginKey: s.directadminLoginKey,
      allowSelfSigned: !!s.directadminAllowSelfSigned,
    });
  }

  /** Ayarlar + izin ön-denetimi (deploy başlatmadan sorunları erken söyle). */
  preflight() {
    const s = this._getSettings() || {};
    const perm = s.toolPermissions && s.toolPermissions.deployment;
    if (perm === "deny") return { ok: false, error: "Deployment izni kapalı (Ayarlar → Güvenlik)." };
    if (!s.directadminHost || !s.directadminUsername || !s.directadminLoginKey) {
      return { ok: false, error: "DirectAdmin bağlantı bilgileri eksik (host, kullanıcı, login key)." };
    }
    return { ok: true };
  }

  async testConnection() {
    const pf = this.preflight();
    if (!pf.ok) throw new Error(pf.error);
    return this._clientFromSettings().testConnection();
  }

  /**
   * ZIP paketini yükle + sunucuda aç.
   * @param {{localZipPath:string, remoteDir:string}} p
   * @returns {Promise<{ok:true, jobId:string, moduleMap:Array, remoteDir:string}>}
   */
  async deployZip({ localZipPath, remoteDir }) {
    const pf = this.preflight();
    if (!pf.ok) throw new Error(pf.error);
    if (this._active) throw new Error(`Devam eden deploy var (${this._active.jobId}) — bitmesini bekleyin.`);
    if (!localZipPath || !fs.existsSync(localZipPath)) throw new Error("Yerel ZIP bulunamadı: " + localZipPath);

    const job = {
      jobId: "dep_" + crypto.randomBytes(6).toString("hex"),
      zip: path.basename(localZipPath),
      remoteDir: String(remoteDir || (this._getSettings() || {}).deployRemoteDir || ""),
      startedAt: Date.now(),
    };
    if (!job.remoteDir) throw new Error("Uzak dizin belirtilmedi (deployRemoteDir).");
    this._active = job;
    try {
      // 1) Paketi tanı — dinamik modül haritası (İster 3)
      this._emit(job, "describing", 5, "Paket taranıyor");
      const entries = await zipEngine.list(localZipPath);
      const moduleMap = scanModuleMap(entries);
      if (!moduleMap.length) throw new Error("ZIP boş görünüyor — deploy iptal.");
      job.moduleMap = moduleMap;

      // 2) Yükle — ilerleme %10-%80 arası akar
      this._emit(job, "uploading", 10, `${job.zip} yükleniyor`);
      const client = this._clientFromSettings();
      await client.uploadZip({
        remoteDir: job.remoteDir,
        localZipPath,
        onProgress: (sent, total) => {
          const pct = 10 + Math.round((sent / Math.max(1, total)) * 70);
          this._emit(job, "uploading", Math.min(80, pct), `${Math.round(sent / 1024)}/${Math.round(total / 1024)} KB`);
        },
      });

      // 3) Sunucuda aç
      this._emit(job, "extracting", 85, "Sunucuda arşiv açılıyor");
      await client.extract({ remoteDir: job.remoteDir, zipName: job.zip });

      this._emit(job, "done", 100, `${moduleMap.length} modül / ${moduleMap.reduce((a, m) => a + m.files, 0)} dosya yayında`);
      return { ok: true, jobId: job.jobId, moduleMap, remoteDir: job.remoteDir };
    } catch (e) {
      this._emit(job, "failed", 100, String((e && e.message) || e));
      throw e;
    } finally {
      this._active = null;
    }
  }
}

module.exports = { DeploymentManager, scanModuleMap };
