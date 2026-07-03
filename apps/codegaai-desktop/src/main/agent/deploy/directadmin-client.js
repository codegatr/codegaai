"use strict";

/**
 * directadmin-client.js — DirectAdmin HTTP API istemcisi (V7 / saf Node, bağımlılıksız).
 *
 * Kimlik: kullanıcı adı + LOGIN KEY (asla ana şifre değil) → HTTP Basic.
 * Kanallar:
 *   CMD_API_SHOW_DOMAINS            → bağlantı/yetki testi
 *   CMD_FILE_MANAGER (action=upload)  → multipart ZIP yükleme
 *   CMD_FILE_MANAGER (action=extract) → sunucuda arşiv açma
 *
 * Güvenlik sözleşmesi (CODEGA_RULES):
 *  - loginKey hiçbir log/hata mesajına yazılmaz (maskelenir).
 *  - Yalnız HTTPS; self-signed sertifika desteği açıkça opt-in (allowSelfSigned).
 *  - Uzak yol her zaman kullanıcı home'una göre; ".." reddedilir (path traversal).
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const crypto = require("node:crypto");

function assertSafeRemotePath(remote) {
  const r = String(remote || "").replace(/\\/g, "/");
  if (!r.startsWith("/")) throw new Error("Uzak yol '/' ile başlamalı (örn. /domains/site.com/public_html)");
  if (r.split("/").some((seg) => seg === "..")) throw new Error("Uzak yolda '..' kullanılamaz");
  return r.replace(/\/+$/, "") || "/";
}

class DirectAdminClient {
  /**
   * @param {{host:string, port?:number, username:string, loginKey:string, allowSelfSigned?:boolean, timeoutMs?:number}} cfg
   */
  constructor(cfg = {}) {
    this.host = String(cfg.host || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.port = Number(cfg.port) || 2222;
    this.username = String(cfg.username || "");
    this._loginKey = String(cfg.loginKey || "");
    this.allowSelfSigned = !!cfg.allowSelfSigned;
    this.timeoutMs = Number(cfg.timeoutMs) || 120000;
    if (!this.host) throw new Error("DirectAdmin host gerekli");
    if (!this.username || !this._loginKey) throw new Error("DirectAdmin kullanıcı adı ve login key gerekli");
  }

  _authHeader() {
    return "Basic " + Buffer.from(`${this.username}:${this._loginKey}`).toString("base64");
  }

  /** Hata metinlerinde anahtar asla görünmesin. */
  _mask(text) {
    return String(text || "").split(this._loginKey).join("****");
  }

  _request({ method = "GET", cmd, query = "", headers = {}, body = null, onUploadProgress = null }) {
    const qs = query ? `?${query}` : "";
    const options = {
      host: this.host,
      port: this.port,
      method,
      path: `/${cmd}${qs}`,
      headers: { Authorization: this._authHeader(), ...headers },
      rejectUnauthorized: !this.allowSelfSigned,
      timeout: this.timeoutMs,
    };
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(this._mask(`DirectAdmin HTTP ${res.statusCode} (${cmd}): ${data.slice(0, 200)}`)));
            return;
          }
          // DA hata sinyali gövdede "error=1" olarak da gelebilir (HTTP 200 ile).
          if (/(^|&)error=1(&|$)/.test(data)) {
            reject(new Error(this._mask(`DirectAdmin hatası (${cmd}): ${decodeURIComponent(data).slice(0, 300)}`)));
            return;
          }
          resolve(data);
        });
      });
      req.on("timeout", () => { req.destroy(new Error(`DirectAdmin ${Math.round(this.timeoutMs / 1000)}sn içinde yanıt vermedi (${cmd})`)); });
      req.on("error", (e) => reject(new Error(this._mask(e.message || String(e)))));
      if (body) {
        if (typeof body.pipeWithProgress === "function") body.pipeWithProgress(req, onUploadProgress);
        else { req.write(body); req.end(); }
      } else req.end();
    });
  }

  /** Bağlantı + yetki testi. */
  async testConnection() {
    const out = await this._request({ cmd: "CMD_API_SHOW_DOMAINS" });
    return { ok: true, domains: out.split("&").map((p) => p.replace(/^list\[\]=/, "")).filter(Boolean) };
  }

  /**
   * ZIP yükle (multipart/form-data, stream — RAM'e tam dosya alınmaz).
   * @param {{remoteDir:string, localZipPath:string, onProgress?:(sent:number,total:number)=>void}} p
   */
  async uploadZip({ remoteDir, localZipPath, onProgress }) {
    const dir = assertSafeRemotePath(remoteDir);
    const stat = fs.statSync(localZipPath);
    const fileName = path.basename(localZipPath);
    const boundary = "----codega" + crypto.randomBytes(12).toString("hex");
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file1"; filename="${fileName}"\r\n` +
      "Content-Type: application/zip\r\n\r\n"
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const total = head.length + stat.size + tail.length;

    const body = {
      pipeWithProgress(req, cb) {
        req.setHeader("Content-Length", total);
        let sent = 0;
        const tick = (n) => { sent += n; if (cb) { try { cb(Math.min(sent, total), total); } catch (_e) {} } };
        req.write(head); tick(head.length);
        const rs = fs.createReadStream(localZipPath, { highWaterMark: 256 * 1024 });
        rs.on("data", (chunk) => { if (!req.write(chunk)) rs.pause(); tick(chunk.length); });
        req.on("drain", () => rs.resume());
        rs.on("error", (e) => req.destroy(e));
        rs.on("end", () => { req.write(tail); tick(tail.length); req.end(); });
      },
    };

    await this._request({
      method: "POST",
      cmd: "CMD_FILE_MANAGER",
      query: `action=upload&path=${encodeURIComponent(dir)}`,
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
      onUploadProgress: onProgress,
    });
    return { ok: true, remoteFile: `${dir}/${fileName}`, bytes: stat.size };
  }

  /** Sunucuda arşivi bulunduğu dizine aç. */
  async extract({ remoteDir, zipName }) {
    const dir = assertSafeRemotePath(remoteDir);
    const safeName = path.posix.basename(String(zipName || ""));
    if (!/\.zip$/i.test(safeName)) throw new Error("extract yalnız .zip dosyaları için");
    const form = new URLSearchParams({ action: "extract", path: `${dir}/${safeName}`, directory: dir }).toString();
    await this._request({
      method: "POST",
      cmd: "CMD_FILE_MANAGER",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(form) },
      body: form,
    });
    return { ok: true, extractedTo: dir };
  }
}

module.exports = { DirectAdminClient, assertSafeRemotePath };
