"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_GUARDRAIL_CONFIG = Object.freeze({
  enabled: true,
  quarantineEnabled: true,
  maxLocalRetries: 2,
  retryTemperature: 0.1,
});

const STRUCTURAL_PATTERNS = Object.freeze([
  {
    id: "sql_on_join",
    reason: "sql_syntax_salad",
    re: /\bon\s+join\s*(?:\(|\b)/i,
  },
  {
    id: "sql_parameterless_join",
    reason: "sql_syntax_salad",
    re: /\bjoin\s*\([^)]*\)/i,
  },
  {
    id: "sql_malformed_customers_join",
    reason: "sql_syntax_salad",
    re: /\bcustomers(?:_c|\s+\w+)?\s+on\s+join\b/i,
  },
  {
    id: "dangling_sql_alias",
    reason: "dangling_alias",
    re: /\b(?:select|where|and|or|on|by|,)\s*[a-z]\.\s*(?:[,);]|$)/i,
  },
  {
    id: "dangling_buffer_alias",
    reason: "dangling_alias",
    re: /(?:^|\n)\s*(?:c|t)\.\s*$/i,
  },
  {
    id: "lazy_line_placeholder",
    reason: "lazy_placeholder",
    re: /\/\/\s*(?:rest of|code placeholder|code here|logic here|query here|rest of logic|rest of query)/i,
  },
  {
    id: "lazy_block_placeholder",
    reason: "lazy_placeholder",
    re: /\/\*\s*(?:rest of|code placeholder|code here|logic here|query here|rest of logic|rest of query)/i,
  },
  {
    id: "lazy_html_placeholder",
    reason: "lazy_placeholder",
    re: /<!--\s*(?:rest of|code placeholder|code here|logic here|query here)/i,
  },
  {
    id: "truncated_php_chain",
    reason: "php_syntax_salad",
    re: /(?:->|::|\$[a-zA-Z_][\w]*\s*=)\s*$/i,
  },
]);

function normalizeGuardrailConfig(settings = {}, overrides = {}) {
  const source = { ...(settings || {}), ...(overrides || {}) };
  const toBool = (value, fallback) => (
    value === undefined || value === null ? fallback : value !== false && value !== "false" && value !== 0
  );
  const maxRetries = Number(source.streamGuardrailMaxLocalRetries);
  const normalizedMaxRetries = Number(source.maxLocalRetries);
  const retryTemperature = Number(source.streamGuardrailRetryTemperature);
  const normalizedRetryTemperature = Number(source.retryTemperature);
  return {
    enabled: toBool(source.streamGuardrailEnabled ?? source.enabled, DEFAULT_GUARDRAIL_CONFIG.enabled),
    quarantineEnabled: toBool(source.streamGuardrailQuarantineEnabled ?? source.quarantineEnabled, DEFAULT_GUARDRAIL_CONFIG.quarantineEnabled),
    maxLocalRetries: Number.isFinite(maxRetries) && maxRetries >= 0
      ? Math.min(5, Math.floor(maxRetries))
      : Number.isFinite(normalizedMaxRetries) && normalizedMaxRetries >= 0
        ? Math.min(5, Math.floor(normalizedMaxRetries))
      : DEFAULT_GUARDRAIL_CONFIG.maxLocalRetries,
    retryTemperature: Number.isFinite(retryTemperature) && retryTemperature >= 0
      ? Math.min(0.4, retryTemperature)
      : Number.isFinite(normalizedRetryTemperature) && normalizedRetryTemperature >= 0
        ? Math.min(0.4, normalizedRetryTemperature)
      : DEFAULT_GUARDRAIL_CONFIG.retryTemperature,
  };
}

function detectStreamGuardrailFailure(text, config = {}) {
  const cfg = normalizeGuardrailConfig({}, config);
  if (!cfg.enabled) return { bad: false, reason: "", pattern: "", action: "allow" };
  const value = String(text || "");
  if (!value) return { bad: false, reason: "", pattern: "", action: "allow" };
  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.re.test(value)) {
      return {
        bad: true,
        reason: pattern.reason,
        pattern: pattern.id,
        action: "abort_quarantine_retry",
      };
    }
  }
  const tail = value.slice(-800);
  const symbols = (tail.match(/[^\s\w.,;:!?'"()[\]{}<>\/%&@#+*=\-|_$]/g) || []).length;
  const visible = (tail.match(/\S/g) || []).length;
  if (visible >= 120 && symbols / visible > 0.28) {
    return {
      bad: true,
      reason: "char_salad",
      pattern: "symbol_density",
      action: "abort_quarantine_retry",
    };
  }
  return { bad: false, reason: "", pattern: "", action: "allow" };
}

function quarantineLogPath() {
  return process.env.CODEGA_STREAM_QUARANTINE_PATH ||
    process.env.CODEGA_DIAGNOSTIC_LOG_PATH ||
    path.join(os.tmpdir(), "codegaai-stream-quarantine.jsonl");
}

function redactSecrets(text) {
  return String(text || "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***")
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=***");
}

function quarantineStreamFailure(event = {}, settings = {}) {
  const cfg = normalizeGuardrailConfig(settings);
  if (!cfg.enabled || !cfg.quarantineEnabled) return false;
  const record = {
    at: new Date().toISOString(),
    reason: String(event.reason || "structural_error"),
    pattern: String(event.pattern || ""),
    provider: String(event.provider || "ollama"),
    model: String(event.model || ""),
    attempt: Number.isFinite(Number(event.attempt)) ? Number(event.attempt) : 0,
    retryCount: Number.isFinite(Number(event.retryCount)) ? Number(event.retryCount) : 0,
    action: String(event.action || "abort"),
    excerpt: redactSecrets(String(event.text || "")).slice(-4000),
  };
  try {
    fs.mkdirSync(path.dirname(quarantineLogPath()), { recursive: true });
    fs.appendFileSync(quarantineLogPath(), JSON.stringify(record) + "\n", "utf8");
    return true;
  } catch (_e) {
    return false;
  }
}

// İnsan-okur teşhis etiketleri (öz-yansıma onarımında modele gösterilir).
const DEFECT_LABELS = Object.freeze({
  sql_on_join: "SQL'de 'ON JOIN' yazılmış — doğru sözdizimi 'JOIN tablo alias ON koşul'dur; ON ile JOIN yer değiştirmiş",
  sql_parameterless_join: "JOIN(...) biçiminde parametreli-fonksiyon gibi JOIN kullanılmış — JOIN bir fonksiyon değildir",
  sql_malformed_customers_join: "Tablo adı ile JOIN sözdizimi iç içe geçmiş (örn. 'customers ON JOIN')",
  dangling_sql_alias: "Yarım kalmış alias — 'c.' gibi bir tablo takma adından sonra kolon adı yazılmamış",
  dangling_buffer_alias: "Satır sonunda yarım alias kalmış ('c.' / 't.') — ifade tamamlanmamış",
  lazy_line_placeholder: "Kodun ortasına '// rest of ...' gibi tembel placeholder bırakılmış — kod eksik",
  lazy_block_placeholder: "Blok yorum placeholder'ı bırakılmış — gerçek kod yazılmamış",
  lazy_html_placeholder: "HTML placeholder yorumu bırakılmış — gerçek içerik yazılmamış",
  truncated_php_chain: "PHP ifadesi yarıda kesilmiş (-> veya = ile bitiyor) — zincir tamamlanmamış",
});

/**
 * ÖZ-YANSIMA TEŞHİSİ: bozuk metindeki SOMUT kusurları listeler (hangi kalıp,
 * insan-okur açıklama, suçlu satır kesiti). Onarım turunda modele "neyi neden
 * yanlış yaptın" olarak gösterilir — jenerik 'tekrar dene'den çok daha etkili.
 */
function diagnoseStructuralDefects(text) {
  const value = String(text || "");
  const defects = [];
  for (const pattern of STRUCTURAL_PATTERNS) {
    const m = value.match(pattern.re);
    if (!m) continue;
    const idx = m.index || 0;
    const line = value.slice(Math.max(0, value.lastIndexOf("\n", idx) + 1), value.indexOf("\n", idx) === -1 ? undefined : value.indexOf("\n", idx)).trim().slice(0, 160);
    defects.push({
      id: pattern.id,
      reason: pattern.reason,
      label: DEFECT_LABELS[pattern.id] || pattern.id,
      evidence: line,
    });
  }
  return defects;
}

/**
 * ÖZ-YANSIMA ONARIM TALİMATI: bozuk çıktı + somut kusur listesi ile modele
 * "önce hatanın mantığını analiz et, sonra TAM düzeltilmiş sürümü yaz" der.
 * Kullanıcıya hata basmak yerine arka planda kendi hatasını düzeltme yolu.
 */
function buildSelfRepairInstruction(reason, attempt, defects = []) {
  const defectLines = (defects || []).slice(0, 5).map((d, i) =>
    `${i + 1}. ${d.label}${d.evidence ? `\n   Suçlu satır: \`${d.evidence}\`` : ""}`);
  return [
    `ÖZ-YANSIMA ONARIMI (deneme ${attempt}): az önceki üretimin ${reason} nedeniyle karantinaya alındı.`,
    "Bu bir yeniden-yazma değil, HATA DÜZELTME görevidir. Aşağıda kendi çıktında tespit edilen SOMUT kusurlar var:",
    defectLines.length ? defectLines.join("\n") : "- (kalıp eşleşmedi; kuyruk bozulması/karakter salatası tespit edildi)",
    "",
    "Şimdi şunu yap:",
    "1) Her kusur için hangi MANTIK hatasını yaptığını içinden kısaca belirle (yazma).",
    "2) Kullanıcının ORİJİNAL isteğini, bu hataları düzeltilmiş TAM ve ÇALIŞIR haliyle TEK seferde yeniden üret.",
    "Kurallar: bozuk tokenları devam ettirme, bozuk çıktıdan alıntı yapma, placeholder bırakma.",
    "SQL için: FROM tablo alias JOIN tablo alias ON koşul. ASLA 'ON JOIN', 'JOIN(...)', yarım alias ('c.') yazma.",
  ].join("\n");
}

function buildGuardrailRetryInstruction(reason, attempt) {
  return [
    `Guardrail recovery attempt ${attempt}: previous local output was aborted because of ${reason}.`,
    "Flush the broken syntax path. Re-answer the original user request as one complete artifact.",
    "Do not continue corrupted tokens, do not quote broken output, and do not use placeholders.",
    "For SQL use: FROM table alias JOIN table alias ON condition. Never write ON JOIN, JOIN(...), dangling aliases, or incomplete PHP chains.",
    "Keep the answer deterministic, complete, and production-ready.",
  ].join("\n");
}

module.exports = {
  DEFAULT_GUARDRAIL_CONFIG,
  STRUCTURAL_PATTERNS,
  normalizeGuardrailConfig,
  detectStreamGuardrailFailure,
  quarantineLogPath,
  quarantineStreamFailure,
  buildGuardrailRetryInstruction,
  diagnoseStructuralDefects,
  buildSelfRepairInstruction,
  DEFECT_LABELS,
};
