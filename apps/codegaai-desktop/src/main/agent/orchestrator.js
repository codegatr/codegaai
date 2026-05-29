"use strict";
/**
 * agent/orchestrator.js
 * ----------------------
 * Hafif multi-agent orchestrator (Supervisor + Specialist Agents + Verifier).
 * Framework yok; mevcut planner + agent-loop + uzman ajanlar üstüne kurulu.
 *
 * Akış:
 *   1. Hedefi alt adımlara böl (planner.makePlan).
 *   2. Her adımı uygun uzmana yönlendir (agents.routeStep) ve çalıştır.
 *   3. Bir denetçi (reviewer) tüm sonuçları birleştirip final cevabı üretir.
 *
 * Bağımlılıklar enjekte edilir (ctx) → modelsiz test edilebilir.
 *   ctx.makePlan(goal) -> string[]
 *   ctx.runSpecialist(specialistKey, taskText, goal) -> string
 *   ctx.synthesize(goal, stepResults) -> string
 */

const MAX_STEPS = 4;

async function runOrchestrated(goal, ctx) {
  const trace = [];
  let plan = [];
  try {
    plan = (await ctx.makePlan(goal)) || [];
  } catch (_e) {
    plan = [];
  }
  plan = plan.slice(0, MAX_STEPS);

  // Plan çıkmazsa tek adımlık generalist görevine düş
  if (!plan.length) plan = [goal];

  const stepResults = [];
  for (const step of plan) {
    const specialist = ctx.routeStep(step);
    let output = "";
    try {
      output = (await ctx.runSpecialist(specialist, step, goal)) || "";
    } catch (e) {
      output = `⚠️ Adım hatası (${specialist}): ${e.message || e}`;
    }
    stepResults.push({ step, specialist, output });
    trace.push(`[${specialist}] ${step}`);
  }

  let finalText = "";
  try {
    finalText = (await ctx.synthesize(goal, stepResults)) || "";
  } catch (_e) {
    // Sentez başarısızsa adım çıktılarını birleştir
    finalText = stepResults.map((r) => r.output).filter(Boolean).join("\n\n");
  }

  return { content: finalText, plan, stepResults, trace };
}

module.exports = { runOrchestrated, MAX_STEPS };
