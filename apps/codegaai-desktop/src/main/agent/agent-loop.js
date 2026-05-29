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

/**
 * @param {Array<{role,content}>} messages
 * @param {(msgs:Array)=>Promise<string>} generateFn
 * @param {{maxIters?:number, observationRole?:string}} opts
 * @returns {Promise<{content,iterations,stoppedReason,toolCalls,steps}>}
 */
async function runReact(messages, generateFn, opts = {}) {
  const { maxIters = 4, observationRole = "user", allowedTools = null } = opts;
  const convo = messages.slice();
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

    const { calls } = await parseAndRunTools(raw, allowedTools);
    step.toolCalls = calls.map((c) => ({
      name: c.name, args: c.args, result: c.result, error: c.error, elapsedMs: c.elapsedMs,
    }));
    for (const c of calls) {
      result.toolCalls.push({ name: c.name, result: c.result, elapsedMs: c.elapsedMs });
    }

    const observation = formatObservation(calls);
    step.observation = observation;
    result.steps.push(step);

    convo.push({ role: "assistant", content: raw });
    convo.push({ role: observationRole, content: observation });
    result.iterations = i;
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
  } catch (e) {
    result.content = `⚠️ Final üretim hatası: ${e.message || e}`;
  }
  result.stoppedReason = "max_iters";
  return result;
}

module.exports = { runReact, hasToolCall, cleanFinal };
