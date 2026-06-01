"use strict";

async function runStage(context, name, fn, opts = {}) {
  try {
    const result = await fn();
    const ok = result && result.ok === false ? false : true;
    context.record({
      name,
      ok,
      status: ok ? "passed" : "failed",
      confidence: result && Number.isFinite(result.confidence) ? result.confidence : null,
      errors: result && Array.isArray(result.errors) ? result.errors : [],
      detail: result && result.detail ? result.detail : null,
      blocking: opts.blocking === true,
    });
    return result || { ok: true };
  } catch (error) {
    const message = error && error.message ? error.message : String(error || "stage failed");
    context.record({
      name,
      ok: false,
      status: "error",
      errors: [message],
      blocking: opts.blocking === true,
    });
    if (opts.blocking) {
      return { ok: false, errors: [message] };
    }
    return { ok: true, skipped: true, errors: [message] };
  }
}

function blockedAnswer(context) {
  const errors = (context.blockErrors || []).filter(Boolean);
  const detail = errors.length ? ` ${errors.join(" ")}` : "";
  return [
    "Yanıt doğrulama kapısından geçmedi, bu yüzden hatalı olabilecek cevabı göstermiyorum.",
    `Bloke eden aşama: ${context.blockReason || "cognitive_gate"}.${detail}`,
    "",
    "Final Answer: Yanıt güvenli şekilde doğrulanamadı.",
  ].join("\n");
}

module.exports = {
  blockedAnswer,
  runStage,
};
