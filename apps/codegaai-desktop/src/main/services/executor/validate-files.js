"use strict";

/**
 * validate-files.js — Üretilen dosyalara ZIP'ten ÖNCE temel syntax doğrulaması.
 *
 * - .json → JSON.parse
 * - .js/.cjs/.mjs → vm.Script (ESM import/export hataları TOLERE edilir → yanlış-pozitif yok)
 * - .php → `php -l` (php kuruluysa; yoksa atla, uyarı yok)
 *
 * BLOKLAMAZ: sonuç { ok, warnings, phpChecked }. Çağıran isterse "uyarıyla
 * üretildi" işaretler ama ZIP yine üretilebilir.
 */

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const vm   = require("node:vm");
const os   = require("node:os");
const fsp  = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const execFileP = promisify(execFile);

async function phpAvailable() {
  try { await execFileP("php", ["-v"], { timeout: 5000 }); return true; }
  catch (_e) { return false; }
}

// vm.Script hatası ESM/top-level-await kaynaklı mı? (o zaman gerçek syntax hatası değil)
function isModuleSyntaxError(err) {
  const m = String(err && err.message || "");
  return /import|export|await is only valid|Cannot use import|export statement|import statement/i.test(m);
}

/**
 * @param {Array<{path:string,content:string}>} files
 * @param {{php?:boolean}} [opts]  php=false → PHP kontrolünü atla
 * @returns {Promise<{ok:boolean, warnings:Array<{path:string,error:string}>, phpChecked:boolean}>}
 */
async function validateFiles(files, opts = {}) {
  const list = Array.isArray(files) ? files : [];
  const warnings = [];
  let php = null; // lazy availability

  for (const f of list) {
    const p = String(f && f.path || "");
    const ext = path.extname(p).toLowerCase();
    const content = String(f && f.content != null ? f.content : "");

    if (ext === ".json") {
      try { JSON.parse(content); }
      catch (e) { warnings.push({ path: p, error: `JSON parse: ${e.message}` }); }
    } else if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
      try { new vm.Script(content, { filename: p }); }
      catch (e) {
        if (!isModuleSyntaxError(e)) warnings.push({ path: p, error: `JS syntax: ${e.message}` });
      }
    } else if (ext === ".php" && opts.php !== false) {
      if (php === null) php = await phpAvailable();
      if (php) {
        const tmp = path.join(os.tmpdir(), `codega_lint_${crypto.randomBytes(4).toString("hex")}.php`);
        try {
          await fsp.writeFile(tmp, content, "utf8");
          await execFileP("php", ["-l", tmp], { timeout: 8000 });
        } catch (e) {
          if (e && e.code === "ENOENT") { php = false; } // php kayboldu → atla
          else warnings.push({ path: p, error: `php -l: ${String((e && (e.stderr || e.message)) || e).replace(/\s+/g, " ").slice(0, 160)}` });
        } finally {
          await fsp.unlink(tmp).catch(() => {});
        }
      }
    }
  }

  return { ok: warnings.length === 0, warnings, phpChecked: php === true };
}

module.exports = { validateFiles, phpAvailable, isModuleSyntaxError };
