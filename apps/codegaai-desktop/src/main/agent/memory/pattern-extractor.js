"use strict";

/**
 * pattern-extractor.js — CODEGA AI Execution Memory
 *
 * Trace listesinden örüntü çıkarır ve kural adayı üretir.
 *
 * Bir kural adayı üretmek için:
 *  - Aynı bağlamda MIN_SAMPLES veya daha fazla trace
 *  - Başarı oranı CONFIDENCE_THRESHOLD üzerinde (pozitif kural)
 *    veya altında (negatif/uyarı kuralı)
 */

const CONFIDENCE_THRESHOLD = 0.70;  // %70 başarı = pozitif kural
const FAILURE_THRESHOLD    = 0.30;  // %30 altı = negatif/uyarı kuralı
const MIN_SAMPLES          = 3;     // Minimum örnek sayısı
const MAX_RULE_LESSON      = 400;   // Güvenlik: prompt injection engeli

class PatternExtractor {
  /**
   * @param {object[]} traces — TraceRecorder'dan gelen trace dizisi
   * @returns {object[]} rule candidates
   */
  analyze(traces) {
    if (!Array.isArray(traces) || traces.length < MIN_SAMPLES) return [];

    // (agentId + stack + features) bazında grupla
    const groups = new Map();
    for (const trace of traces) {
      const key = _makeKey(trace);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          agentId:  trace.agentId,
          context:  trace.inputContext || { agentId: trace.agentId },
          traces:   [],
        });
      }
      groups.get(key).traces.push(trace);
    }

    const candidates = [];

    for (const group of groups.values()) {
      if (group.traces.length < MIN_SAMPLES) continue;

      const total      = group.traces.length;
      const successes  = group.traces.filter(t => t.success);
      const failures   = group.traces.filter(t => !t.success);
      const confidence = successes.length / total;

      if (confidence >= CONFIDENCE_THRESHOLD && successes.length >= MIN_SAMPLES) {
        candidates.push(_buildRule(group, "success", confidence, total));
      } else if (confidence <= FAILURE_THRESHOLD && failures.length >= MIN_SAMPLES) {
        const errorCodes = [...new Set(
          failures.map(t => t.errorCode).filter(Boolean)
        )].slice(0, 5);
        candidates.push(_buildRule(group, "failure", 1 - confidence, total, errorCodes));
      }
    }

    return candidates;
  }
}

// ── private ───────────────────────────────────────────────────────

function _makeKey(trace) {
  const ctx = trace.inputContext || {};
  return [
    trace.agentId || "?",
    ctx.stack     || "any",
    (ctx.features || []).slice().sort().join(","),
  ].join("|");
}

function _buildRule(group, type, confidence, samples, errorCodes = []) {
  const ctx  = group.context || {};
  const parts = [];
  if (ctx.stack)            parts.push(`stack=${ctx.stack}`);
  if (ctx.features?.length) parts.push(`features=[${ctx.features.join(",")}]`);
  if (ctx.database)         parts.push(`db=${ctx.database}`);

  let lesson;
  if (type === "success") {
    lesson = `Başarı örüntüsü: ${parts.join(", ") || group.agentId}`;
  } else {
    const errs = errorCodes.length ? ` | Hatalar: ${errorCodes.join("; ")}` : "";
    lesson = `Hata örüntüsü: ${parts.join(", ") || group.agentId}${errs}`;
  }

  return {
    id:         `rule_${group.key.replace(/[^a-z0-9_]/gi, "_")}`,
    agentId:    group.agentId,
    context:    group.context,
    type,
    confidence: Math.round(confidence * 1000) / 1000,
    samples,
    errorCodes,
    lesson:     lesson.slice(0, MAX_RULE_LESSON),
    active:     true,
    updatedAt:  Date.now(),
  };
}

module.exports = PatternExtractor;
