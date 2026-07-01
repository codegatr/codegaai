"use strict";

/**
 * extract-files.js — LLM metninden dosya listesi çıkarır.
 *
 * Kod bloklarını [{path, content, lang}]'e çevirir. Dosya adı yakalama sırası:
 *   1) Etiket:  ```php:config.php  ya da  ```php config.php  (info satırı)
 *   2) Yorum yönergesi: ilk satırlarda  // dosya: config.php  /  # file: x  /  <!-- dosya: y -->
 *   3) İçerik sezgisi:  CREATE TABLE→schema.sql, RewriteEngine→.htaccess,
 *      <!DOCTYPE html>→index.php, PDO/connect→config.php
 *   4) Son çare: dilden jenerik ad (dosya-N.uzanti)
 *
 * Amaç: DirectAdmin'e açılan ZIP'te dosyalar GERÇEK adlarıyla gelsin. Saf + test edilebilir.
 */

const EXT_BY_LANG = {
  php: "php", sql: "sql", javascript: "js", js: "js", typescript: "ts", ts: "ts",
  html: "html", css: "css", json: "json", bash: "sh", sh: "sh", yaml: "yml", yml: "yml",
  python: "py", py: "py", md: "md", markdown: "md", env: "env", ini: "ini", xml: "xml",
  htaccess: "htaccess", apache: "htaccess",
};

function normalizePath(p) {
  return String(p || "")
    .trim()
    .replace(/^['"`]|['"`]$/g, "")     // sarmalayan tırnakları at
    .replace(/^\.?[\\/]+/, "")          // baştaki ./ veya /
    .replace(/\\/g, "/");
}

// info satırından dosya adı: önce "php:config.php" (iki nokta) sonra boşlukla ayrılmış yol-token.
function fileNameFromInfo(info, lang) {
  for (const t of info) {
    if (!t) continue;
    const colon = t.match(/^[a-z0-9]+:(.+)$/i);   // php:config.php
    if (colon && /[.\/]/.test(colon[1])) return normalizePath(colon[1]);
  }
  const cand = info.find((t) => t && t.toLowerCase() !== lang && /[.\/\\]/.test(t) && !/^```/.test(t));
  return cand ? normalizePath(cand) : null;
}

// Kod bloğunun ilk satırlarındaki  // dosya: x  /  # file: x  /  <!-- dosya: x -->  yönergesi.
const DIRECTIVE_RE = /^\s*(?:\/\/|#|--|;|<!--|\/\*)\s*(?:dosya|file|filename|dosya\s*ad[ıi]|path|yol)\s*[:=]\s*([^\s*>]+)/i;
function fileNameFromComment(content) {
  const lines = String(content || "").split(/\r?\n/, 4); // ilk 4 satıra bak
  for (const ln of lines) {
    const m = ln.match(DIRECTIVE_RE);
    if (m && /[.\/]/.test(m[1])) return { name: normalizePath(m[1]), line: ln };
  }
  return null;
}

// İçerikten mantıklı bir ad tahmin et (etiket/yorum yoksa jenerik yerine).
function fileNameFromContent(content, lang) {
  const c = String(content || "");
  if (/^\s*(?:RewriteEngine|RewriteRule|RewriteCond)\b/im.test(c) || /RewriteEngine\s+On/i.test(c)) return ".htaccess";
  if (/\bCREATE\s+TABLE\b/i.test(c) || /\bINSERT\s+INTO\b/i.test(c)) return "schema.sql";
  if (/<!DOCTYPE\s+html/i.test(c) || /<html[\s>]/i.test(c) || /<\/html>/i.test(c)) return "index.php";
  const looksPhp = lang === "php" || /^\s*<\?php/i.test(c);
  if (looksPhp && /\bnew\s+PDO\b|\bPDO\b|mysqli_connect|->\s*connect\b|DB_HOST|DB_NAME|getenv\s*\(/i.test(c)) return "config.php";
  return null;
}

/**
 * @param {string} text
 * @returns {Array<{path:string, content:string, lang:string}>}
 */
function extractFiles(text) {
  const out = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m;
  let i = 0;
  const usedPaths = new Set();
  while ((m = re.exec(String(text || "")))) {
    i++;
    const info = (m[1] || "").trim().split(/\s+/).filter(Boolean);

    // dil: info[0] "php" ya da "php:config.php" olabilir.
    let rawLang = (info[0] || "").toLowerCase();
    const ci = rawLang.indexOf(":");
    const lang = ci > 0 ? rawLang.slice(0, ci) : rawLang;

    let content = m[2].replace(/\n$/, "");

    // 1) Etiket → 2) Yorum yönergesi → 3) İçerik sezgisi → 4) Jenerik
    let p = fileNameFromInfo(info, lang);
    if (!p) {
      const fromComment = fileNameFromComment(content);
      if (fromComment) {
        p = fromComment.name;
        // Sadece-yönerge satırını içerikten temizle (kod kirlenmesin).
        content = content.replace(fromComment.line, "").replace(/^\r?\n/, "");
      }
    }
    if (!p) p = fileNameFromContent(content, lang);
    if (!p) {
      const ext = EXT_BY_LANG[lang] || "txt";
      p = `dosya-${i}.${ext}`;
    }

    // Aynı yol iki kez gelirse ikincisini benzersizleştir.
    let finalPath = p;
    let n = 2;
    while (usedPaths.has(finalPath)) {
      const dot = p.lastIndexOf(".");
      const base = p.startsWith(".") && dot === 0; // ".htaccess" gibi gizli dosya
      finalPath = dot > 0 && !base ? `${p.slice(0, dot)}-${n}${p.slice(dot)}` : `${p}-${n}`;
      n++;
    }
    usedPaths.add(finalPath);
    out.push({ path: finalPath, content, lang });
  }
  return out;
}

module.exports = { extractFiles, EXT_BY_LANG, fileNameFromContent, fileNameFromComment, fileNameFromInfo };
