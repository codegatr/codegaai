"use strict";

/**
 * extract-files.js — LLM metninden dosya listesi çıkarır.
 *
 * ```<dil> <yol/dosya>\n ...içerik... ``` kod bloklarını [{path, content}]'e
 * çevirir. Yol etiketi yoksa dilden makul bir ad üretir. Saf + test edilebilir.
 */

const EXT_BY_LANG = {
  php: "php", sql: "sql", javascript: "js", js: "js", typescript: "ts", ts: "ts",
  html: "html", css: "css", json: "json", bash: "sh", sh: "sh", yaml: "yml", yml: "yml",
  python: "py", py: "py", md: "md", markdown: "md", env: "env", ini: "ini", xml: "xml",
};

// info satırından yol-benzeri token bul (./ / . / uzantı içeren).
function pickPath(infoTokens, lang) {
  const cand = infoTokens.find((t) => t && t !== lang && /[./\\]/.test(t) && !/^```/.test(t));
  if (cand) return cand.replace(/^\.?[\\/]/, "").replace(/\\/g, "/");
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
    const lang = (info[0] || "").toLowerCase();
    const content = m[2].replace(/\n$/, "");
    let p = pickPath(info, lang);
    if (!p) {
      const ext = EXT_BY_LANG[lang] || "txt";
      p = `dosya-${i}.${ext}`;
    }
    // Aynı yol iki kez gelirse ikincisini benzersizleştir.
    let finalPath = p;
    let n = 2;
    while (usedPaths.has(finalPath)) {
      const dot = p.lastIndexOf(".");
      finalPath = dot > 0 ? `${p.slice(0, dot)}-${n}${p.slice(dot)}` : `${p}-${n}`;
      n++;
    }
    usedPaths.add(finalPath);
    out.push({ path: finalPath, content, lang });
  }
  return out;
}

module.exports = { extractFiles, EXT_BY_LANG };
