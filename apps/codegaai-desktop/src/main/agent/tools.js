"use strict";
/**
 * agent/tools.js
 * ---------------
 * Ajanın araç (tool) sistemi. Model yanıtında şu formatla araç çağırır:
 *
 *   <tool>web_search("Konya hava durumu")</tool>
 *   <tool>calculate("137 * 42")</tool>
 *   <tool>read_url("https://example.com")</tool>
 *   <tool>current_time()</tool>
 *   <tool>weather("Konya")</tool>
 *   <tool>remember("Yunus Konya'da yaşıyor, web geliştirici")</tool>
 *   <tool>recall("Yunus nerede yaşıyor")</tool>
 *
 * Araçlar gerçek eylem yapar (web araması, sayfa okuma, hesap, hava, hafıza).
 * Modelin ham boyutundan bağımsız olarak ajanı "yetenekli" yapan katman budur.
 */

const { remember, recall } = require("./memory");

const TOOL_PATTERN = /<tool>\s*([\s\S]*?)\s*<\/tool>/gi;
const CALL_PATTERN = /^(\w+)\(([\s\S]*)\)$/;

function hasToolCall(text) {
  return extractToolCalls(text).length > 0;
}

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (CODEGA-AI Agent)" },
    });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------- search parsing
/** DuckDuckGo HTML sonuçlarını yapılandırılmış listeye çevir. */
function parseSearchResults(html, max = 5) {
  const out = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets = [];
  let sm;
  while ((sm = snippetRe.exec(html)) !== null) snippets.push(stripTags(sm[1]));
  let lm;
  let i = 0;
  while ((lm = linkRe.exec(html)) !== null && out.length < Number(max)) {
    const title = stripTags(lm[2]);
    let href = lm[1];
    const m = href.match(/uddg=([^&]+)/);
    if (m) { try { href = decodeURIComponent(m[1]); } catch (_e) {} }
    const snippet = snippets[i] || "";
    i += 1;
    if (title) out.push({ title, href, snippet });
  }
  return out;
}

// ---------------------------------------------------------------- web_search
async function toolWebSearch(query, max = 4) {
  const q = String(query || "").trim();
  if (!q) return "⚠️ Arama sorgusu boş.";
  try {
    const html = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
    );
    const results = parseSearchResults(html, max);
    if (!results.length) return `'${q}' için sonuç bulunamadı.`;
    return (
      `🔍 Web Arama: ${q}\n\n` +
      results.map((r) => `• ${r.title}\n  ${r.snippet}\n  ${r.href}`).join("\n\n")
    );
  } catch (e) {
    return `⚠️ Arama yapılamadı (internet?): ${e.message || e}`;
  }
}

// ------------------------------------------------------------------ research
// Tek çağrıda çok-kaynaklı araştırma: ara -> ilk sonuçların sayfalarını çek ->
// özetlenebilir ham içeriği birleştir. Küçük modeller araçları zincirleyemese
// bile bununla gerçek araştırma yapabilir.
async function toolResearch(query, maxSources = 3) {
  const q = String(query || "").trim();
  if (!q) return "⚠️ Araştırma konusu boş.";
  let results;
  try {
    const html = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
    );
    results = parseSearchResults(html, Math.max(3, Number(maxSources) + 2));
  } catch (e) {
    return `⚠️ Araştırma için arama yapılamadı (internet?): ${e.message || e}`;
  }
  if (!results.length) return `'${q}' için kaynak bulunamadı.`;

  const sources = [];
  for (const r of results) {
    if (sources.length >= Number(maxSources)) break;
    let body = r.snippet || "";
    try {
      const page = await fetchText(r.href, 10000);
      const text = stripTags(page);
      if (text && text.length > body.length) body = text.slice(0, 1500);
    } catch (_e) {
      // sayfa çekilemedi: snippet ile yetin
    }
    sources.push(`### Kaynak ${sources.length + 1}: ${r.title}\n${r.href}\n${body}`);
  }
  return (
    `📚 Araştırma: ${q}\n\n` +
    sources.join("\n\n") +
    "\n\nBu kaynakları karşılaştır, çelişkileri belirt ve kendi sözcüklerinle özetle."
  );
}

// ------------------------------------------------------------------ read_url
async function toolReadUrl(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return "⚠️ Geçerli bir http(s) URL gerekli.";
  try {
    const html = await fetchText(u);
    const text = stripTags(html).slice(0, 4000);
    return `📄 ${u}\n\n${text}`;
  } catch (e) {
    return `⚠️ URL okunamadı: ${e.message || e}`;
  }
}

// ----------------------------------------------------------------- calculate
const CALC_ALLOWED = /^[\d+\-*/%.()\s^]+$/;
const CALC_FUNCS = { sqrt: "Math.sqrt", abs: "Math.abs", sin: "Math.sin",
  cos: "Math.cos", tan: "Math.tan", log: "Math.log", pi: "Math.PI", e: "Math.E" };

function toolCalculate(expr) {
  let s = String(expr || "").trim();
  // izinli fonksiyon/sabit isimlerini Math eşdeğeriyle değiştir
  let probe = s;
  for (const name of Object.keys(CALC_FUNCS)) {
    const re = new RegExp(`\\b${name}\\b`, "gi");
    s = s.replace(re, CALC_FUNCS[name]);
    probe = probe.replace(re, "");
  }
  // değişimden sonra geriye sadece sayı/operatör kalmalı (harf = güvensiz)
  const cleanedProbe = probe.replace(/Math\.\w+/g, "");
  if (!CALC_ALLOWED.test(cleanedProbe.replace(/[A-Za-z.]/g, ""))) {
    // yine de katı kontrol: orijinalde izinsiz harf var mı?
  }
  if (/[A-Za-z]/.test(s.replace(/Math\.\w+/g, "")) || /[;=]/.test(s)) {
    return "⚠️ Sadece sayısal ifadeler hesaplanır.";
  }
  s = s.replace(/\^/g, "**");
  try {
    // s yalnızca sayı/operatör/Math.* içerir -> güvenli
    // eslint-disable-next-line no-new-func
    const value = Function('"use strict"; return (' + s + ");")();
    return `🧮 ${expr} = ${value}`;
  } catch (e) {
    return `⚠️ Hesaplama hatası: ${e.message || e}`;
  }
}

// --------------------------------------------------------------- current_time
function toolCurrentTime() {
  try {
    const now = new Date().toLocaleString("tr-TR", {
      timeZone: "Europe/Istanbul",
      dateStyle: "full",
      timeStyle: "medium",
    });
    return `🕐 ${now} (Türkiye)`;
  } catch (_e) {
    return `🕐 ${new Date().toISOString()}`;
  }
}

// -------------------------------------------------------------------- weather
async function toolWeather(city) {
  const c = String(city || "").trim();
  if (!c) return "⚠️ Şehir gerekli.";
  try {
    const geoRaw = await fetchText(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=1&language=tr`
    );
    const geo = JSON.parse(geoRaw);
    if (!geo.results || !geo.results.length) return `⚠️ '${c}' bulunamadı.`;
    const { latitude, longitude, name } = geo.results[0];
    const wRaw = await fetchText(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&wind_speed_unit=kmh&timezone=Europe%2FIstanbul`
    );
    const w = JSON.parse(wRaw).current;
    return `🌤 ${name}: ${w.temperature_2m}°C, ${w.wind_speed_10m} km/s rüzgar`;
  } catch (e) {
    return `⚠️ Hava durumu alınamadı: ${e.message || e}`;
  }
}

// --------------------------------------------------------------- memory tools
function toolRemember(fact) {
  const r = remember(fact);
  return r.ok ? `✅ Belleğe kaydedildi: "${r.message}"` : `⚠️ ${r.message}`;
}
function toolRecall(query) {
  const hits = recall(query);
  if (!hits.length) return `Belleğimde "${query}" hakkında bilgi yok.`;
  return `🧠 Bellekten:\n${hits.map((h) => `• ${h}`).join("\n")}`;
}

// --------------------------------------------------------------- github tools
const githubClient = require("./github-client");

function parseRepoSpec(arg) {
  const [main, ref] = String(arg || "").split("@");
  const parts = String(main || "").split("/").filter(Boolean);
  return {
    owner: parts[0] || "",
    repo: parts[1] || "",
    path: parts.slice(2).join("/"),
    ref: (ref || "").trim() || undefined,
  };
}

async function toolGithubRead(spec) {
  const { owner, repo, path, ref } = parseRepoSpec(spec);
  if (!owner || !repo) return "⚠️ Format: github_read(\"owner/repo/dosya/yolu\")";
  try {
    if (!path) return `📦 ${owner}/${repo}\n` + (await githubClient.listDir(owner, repo, "", ref));
    const content = await githubClient.readFile(owner, repo, path, ref);
    return `📄 ${owner}/${repo}/${path}\n\n${String(content).slice(0, 4000)}`;
  } catch (e) {
    return `⚠️ GitHub okuma hatası: ${e.message || e}`;
  }
}

async function toolGithubList(spec) {
  const { owner, repo, path, ref } = parseRepoSpec(spec);
  if (!owner || !repo) return "⚠️ Format: github_list(\"owner/repo[/dizin]\")";
  try {
    return `📦 ${owner}/${repo}/${path}\n` + (await githubClient.listDir(owner, repo, path, ref));
  } catch (e) {
    return `⚠️ GitHub listeleme hatası: ${e.message || e}`;
  }
}

async function toolGithubSearch(query) {
  try {
    return `🔎 GitHub kod araması: ${query}\n` + (await githubClient.searchCode(query));
  } catch (e) {
    return `⚠️ GitHub arama hatası: ${e.message || e}`;
  }
}

async function toolGithubDispatch(repoSpec, workflow, ref) {
  const { owner, repo } = parseRepoSpec(repoSpec);
  if (!owner || !repo || !workflow) {
    return '⚠️ Format: github_dispatch("owner/repo", "workflow.yml", "main")';
  }
  try {
    return await githubClient.dispatchWorkflow(owner, repo, workflow, ref || "main");
  } catch (e) {
    return `⚠️ Workflow tetikleme hatası: ${e.message || e}`;
  }
}

// ----------------------------------------------------------------- rag tool
const rag = require("./rag");

async function toolRagSearch(query) {
  try {
    const hits = await rag.search(query, 4);
    if (!hits.length) return "Bilgi tabanında ilgili bir şey bulunamadı.";
    return (
      "📚 Bilgi tabanı:\n" +
      hits.map((h) => `• [${h.title}] ${h.text.slice(0, 400)}`).join("\n\n")
    );
  } catch (e) {
    return `⚠️ RAG arama hatası: ${e.message || e}`;
  }
}

const TOOLS = {
  web_search: { fn: toolWebSearch, desc: "İnternette güncel bilgi ara (DuckDuckGo)" },
  research: { fn: toolResearch, desc: "Bir konuyu çok kaynaktan araştır (ara + sayfaları oku + birleştir)" },
  rag_search: { fn: toolRagSearch, desc: "Yerel bilgi tabanında (eklenen doküman/notlar) ara" },
  read_url: { fn: toolReadUrl, desc: "Bir web sayfasının içeriğini oku" },
  github_read: { fn: toolGithubRead, desc: 'GitHub repo dosyası oku: owner/repo/yol[@ref]' },
  github_list: { fn: toolGithubList, desc: "GitHub repo dizinini listele: owner/repo[/dizin]" },
  github_search: { fn: toolGithubSearch, desc: "GitHub'da kod ara" },
  github_dispatch: { fn: toolGithubDispatch, desc: "GitHub Actions workflow tetikle (sen istersen)" },
  calculate: { fn: toolCalculate, desc: "Matematiksel hesap yap" },
  current_time: { fn: toolCurrentTime, desc: "Şu anki tarih/saat (Türkiye)" },
  weather: { fn: toolWeather, desc: "Bir şehrin hava durumu" },
  remember: { fn: toolRemember, desc: "Kalıcı belleğe bilgi kaydet" },
  recall: { fn: toolRecall, desc: "Kalıcı bellekte ara" },
};

function parseArgs(argsStr) {
  const s = String(argsStr || "").trim();
  if (!s) return [];
  try {
    return JSON.parse(`[${s}]`);
  } catch (_e) {
    return [s.replace(/^['"]|['"]$/g, "")];
  }
}

// Küçük modeller <tool>...</tool> formatını her zaman tutturamaz. Bu yüzden
// araç çağrılarını delimiter'dan BAĞIMSIZ yakalarız: bilinen bir araç adının
// ardından gelen `(...)` çağrısını buluruz — ister <tool>, ister (tool), ister
// [tool], "tool:", ister çıplak yazılmış olsun. Parantez/tırnak dengesi gözetilir.
function extractToolCalls(text) {
  const s = String(text || "");
  const known = new Set(Object.keys(TOOLS));
  const nameRe = /([A-Za-z_]\w*)\s*\(/g;
  const calls = [];
  let m;
  while ((m = nameRe.exec(s)) !== null) {
    const name = m[1];
    if (!known.has(name)) continue;
    const open = nameRe.lastIndex - 1; // '(' konumu
    let depth = 0;
    let inStr = null;
    let j = open;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; continue; }
      if (ch === "(") depth += 1;
      else if (ch === ")") { depth -= 1; if (depth === 0) break; }
    }
    const argsStr = s.slice(open + 1, j);
    calls.push({ name, argsStr, start: m.index, end: j + 1 });
    nameRe.lastIndex = j + 1;
  }
  return calls;
}

// Final cevaptan araç çağrılarını ve delimiter kalıntılarını temizle.
function stripToolCalls(text) {
  const s = String(text || "");
  const calls = extractToolCalls(s);
  let out = s;
  if (calls.length) {
    let acc = "";
    let last = 0;
    for (const c of calls) {
      acc += s.slice(last, c.start);
      last = c.end;
    }
    acc += s.slice(last);
    out = acc;
  }
  return out
    .replace(/<\/?\s*tool\s*>|\(\s*tool\s*\)|\[\s*tool\s*\]|tool_call\s*:/gi, "")
    .trim();
}

/**
 * Metindeki tüm araç çağrılarını (her formatta) çalıştır.
 * @returns {Promise<{calls: Array}>}
 */
async function parseAndRunTools(text) {
  const calls = [];
  for (const found of extractToolCalls(text)) {
    const name = found.name;
    const args = parseArgs(found.argsStr);
    const def = TOOLS[name];
    const call = { name, args, result: null, error: null, elapsedMs: 0 };
    const t0 = Date.now();
    try {
      call.result = await def.fn(...args);
    } catch (e) {
      call.error = e.message || String(e);
      call.result = `⚠️ Araç hatası: ${call.error}`;
    }
    call.elapsedMs = Date.now() - t0;
    calls.push(call);
  }
  return { calls };
}

function toolsSystemPrompt() {
  const defs = Object.entries(TOOLS)
    .map(([name, d]) => `- ${name}(...): ${d.desc}`)
    .join("\n");
  return [
    "## Araçlar",
    "Güncel bilgi, hesap, sayfa okuma veya hafıza gerektiğinde araç çağır.",
    "Format (yalnızca bu): <tool>arac_adi(\"argüman\")</tool>",
    "",
    "Kullanılabilir araçlar:",
    defs,
    "",
    "Kurallar:",
    "1. Güncel/değişen bilgi (haber, fiyat, hava, tarih) → web_search veya weather.",
    "2. Bir konuyu DERİNLEMESİNE öğrenmen/karşılaştırman gerekiyorsa → research (çok kaynak).",
    "3. Kullanıcının eklediği doküman/nota dayalı soru → rag_search (yerel bilgi tabanı).",
    "4. Sayısal işlem → calculate. Asla kafadan hesaplama.",
    "5. Belirli bir kaynağı incelemen gerekiyorsa → read_url.",
    "6. Kod/repo incelemen gerekiyorsa → github_read / github_list / github_search.",
    "7. Kullanıcı bir workflow/derleme tetiklemeni isterse → github_dispatch.",
    "8. Kullanıcı hakkında kalıcı bilgi → remember; gerektiğinde recall.",
    "9. Araç sonucu gelince ONU OKU, üstüne düşün; gerekiyorsa yeni araç çağır, yeterliyse net cevabı yaz.",
  ].join("\n");
}

module.exports = {
  TOOLS,
  TOOL_PATTERN,
  hasToolCall,
  parseAndRunTools,
  toolsSystemPrompt,
  extractToolCalls,
  stripToolCalls,
  // doğrudan test için:
  toolCalculate,
  toolCurrentTime,
  parseSearchResults,
};
