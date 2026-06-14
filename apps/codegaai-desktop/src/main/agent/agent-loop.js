"use strict";
/**
 * agent/agent-loop.js
 * --------------------
 * Gerçek ReAct (Reason + Act) ajan döngüsü — JS sürümü.
 *
 *   üret -> araç çağrılarını çalıştır -> GÖZLEMİ modele geri besle
 *        -> model gözlem üzerine düşünür -> ya yeni araç ya FINAL cevap
 *
 * Bir yerel modeli "Claude gibi" davranan ajana çeviren asıl katman budur.
 * generateFn(messages) -> Promise<string> enjekte edilir; gerçek Ollama'ya da,
 * test için sahte bir fonksiyona da bağlanır (bu yüzden modelsiz test edilebilir).
 */

const { hasToolCall, parseAndRunTools, stripToolCalls } = require("./tools");

const THINK_PATTERN = /<think>[\s\S]*?<\/think>/gi;

/** Final cevabı kullanıcıya gösterilmeden önce <think> bloklarını ve artık araç çağrılarını temizle. */
function cleanFinal(text) {
  let t = String(text || "").replace(THINK_PATTERN, "");
  t = stripToolCalls(t);
  return t.trim();
}

function formatObservation(calls) {
  if (!calls.length) {
    return "## Araç Sonuçları (Gözlem)\n[sonuç yok]\n\nBu bilgiyle final cevabını ver.";
  }
  const lines = ["## Araç Sonuçları (Gözlem)"];
  for (const c of calls) {
    const body = c.result != null ? c.result : (c.error || "");
    lines.push(`### ${c.name}\n${body}`);
  }
  lines.push(
    "\nBu sonuçlara dayanarak: yeterliyse FINAL cevabını yaz, eksikse YENİ bir araç çağır. Aynı çağrıyı tekrarlama."
  );
  return lines.join("\n");
}

function toolCallSignature(call) {
  const args = call && call.args && typeof call.args === "object"
    ? JSON.stringify(call.args, Object.keys(call.args).sort())
    : String(call && call.args || "");
  return `${String(call && call.name || "").trim()}:${args}`;
}

function recoveryObservation(calls, repeated = []) {
  const failed = calls.filter((call) => call && call.error);
  const parts = [];
  if (repeated.length) {
    parts.push(`Tekrarlanan araç çağrısı engellendi: ${repeated.map((call) => call.name).join(", ")}.`);
  }
  if (failed.length) {
    parts.push(`Başarısız araçlar: ${failed.map((call) => `${call.name}: ${call.error}`).join(" | ")}.`);
  }
  parts.push("Aynı çağrıyı yineleme. Argümanları düzelt, farklı bir araç kullan veya eldeki kanıtla durumu açıkça yanıtla.");
  return `## Ajan Kurtarma Rehberi\n${parts.join("\n")}`;
}

/**
 * @param {Array<{role,content}>} messages
 * @param {(msgs:Array)=>Promise<string>} generateFn
 * @param {{maxIters?:number, observationRole?:string}} opts
 * @returns {Promise<{content,iterations,stoppedReason,toolCalls,steps}>}
 */
async function runReact(messages, generateFn, opts = {}) {
  const { maxIters = 4, observationRole = "user", allowedTools = null } = opts;
  const convo = messages.slice();
  const seenToolCalls = new Set();
  const result = {
    content: "",
    iterations: 0,
    stoppedReason: "final_answer",
    toolCalls: [],
    steps: [],
  };

  for (let i = 1; i <= maxIters; i++) {
    let raw;
    try {
      raw = (await generateFn(convo)) || "";
    } catch (e) {
      result.stoppedReason = "error";
      result.content = `⚠️ Üretim hatası: ${e.message || e}`;
      result.iterations = i - 1;
      return result;
    }

    const step = { iteration: i, toolCalls: [], observation: "" };

    if (!hasToolCall(raw)) {
      result.content = cleanFinal(raw);
      result.iterations = i;
      result.stoppedReason = "final_answer";
      result.steps.push(step);
      return result;
    }

    const { calls, skipped: repeated } = await parseAndRunTools(raw, allowedTools, {
      skipSignatures: seenToolCalls,
      signatureFor: toolCallSignature,
    });
    step.toolCalls = calls.map((c) => ({
      name: c.name, args: c.args, result: c.result, error: c.error, elapsedMs: c.elapsedMs,
    }));
    for (const c of calls) {
      result.toolCalls.push({ name: c.name, result: c.result, elapsedMs: c.elapsedMs });
    }

    const observation = (repeated.length || calls.some((call) => call.error))
      ? `${formatObservation(calls)}\n\n${recoveryObservation(calls, repeated)}`
      : formatObservation(calls);
    step.observation = observation;
    result.steps.push(step);

    convo.push({ role: "assistant", content: raw });
    convo.push({ role: observationRole, content: observation });
    result.iterations = i;
    if (!calls.length && repeated.length) result.stoppedReason = "repeated_tool_call";
  }

  // max_iters doldu: araçsız son sentez
  convo.push({
    role: observationRole,
    content:
      "Yeterli bilgi toplandı. Artık ARAÇ KULLANMA. Topladığın sonuçlara dayanarak kısa, net, doğrudan final cevabını ver.",
  });
  try {
    const finalRaw = (await generateFn(convo)) || "";
    result.content = cleanFinal(finalRaw);
    if (!result.content) {
      const useful = result.toolCalls.map((call) => call.result).filter(Boolean);
      result.content = useful.length
        ? `Toplanan araç sonuçları:\n${useful.join("\n\n")}`
        : "Bu görev için güvenilir bir sonuç üretemedim. Araç çağrıları sonuç vermedi; farklı bir yaklaşımla yeniden deneyebilirim.";
    }
  } catch (e) {
    result.content = `⚠️ Final üretim hatası: ${e.message || e}`;
  }
  result.stoppedReason = "max_iters";
  return result;
}

module.exports = {
  runReact,
  hasToolCall,
  cleanFinal,
  formatObservation,
  recoveryObservation,
  toolCallSignature,
};
