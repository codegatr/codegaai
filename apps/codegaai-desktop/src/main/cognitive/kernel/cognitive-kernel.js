"use strict";

const { CognitiveContext } = require("./cognitive-context");
const { blockedAnswer, runStage } = require("./stage-runner");
const { TaskRegistry } = require("./task-registry");
const factLock = require("../../agent/fact-lock");
const cvl = require("../../agent/cvl");
const tde = require("../../agent/tde");
const rpre = require("../../agent/rpre");
const ebse = require("../../agent/ebse");
const hril = require("../../agent/hril");
const ree = require("../../agent/ree");
const rae = require("../../agent/rae");
const sacv = require("../../agent/sacv");
const finalAnswerSanitizer = require("../../agent/final-answer-sanitizer");
const { repairBenchmarkAnswer } = require("../../agent/benchmark-reasoner");
const { enforceConclusion, verifyAnswer } = require("../../agent/reasoning-guard");
const { verifyMathLogic } = require("../../agent/mlvc");

function createContext(input, opts = {}) {
  return new CognitiveContext(input, opts);
}

function runIntake(context) {
  const taskReport = tde.decomposeTasks(context.input);
  const factReport = factLock.extractFacts(context.input);
  context.taskReport = taskReport;
  context.taskRegistry = taskReport.applicable ? new TaskRegistry(taskReport.tasks) : null;
  context.factLock = factReport;
  context.record({
    name: "fact-lock:intake",
    ok: true,
    confidence: factReport.confidence,
    detail: {
      applicable: factReport.applicable,
      numericFacts: factReport.numericFacts.map((item) => item.raw),
      constraints: factReport.constraints.map((item) => item.description),
    },
  });
  context.record({
    name: "tde:intake",
    ok: true,
    confidence: taskReport.confidence,
    detail: {
      applicable: taskReport.applicable,
      count: taskReport.count,
      registryCreated: !!context.taskRegistry,
      tasks: taskReport.tasks.map((task) => ({ id: task.id, label: task.label, domain: task.domain })),
    },
  });
  if (factReport.applicable) {
    context.addMessage({ role: "system", content: factLock.formatFactLockContext(factReport) });
  }
  const taskContext = tde.formatTaskContext(taskReport);
  if (taskContext) {
    context.addMessage({ role: "system", content: taskContext });
  }
  return { ok: true, taskReport, messages: context.messages };
}

async function runPostValidation(context, draftAnswer, opts = {}) {
  let finalText = String(draftAnswer || "").trim();
  context.answer = finalText;
  const stoppedReason = opts.stoppedReason || "";
  const isSmalltalk = stoppedReason === "smalltalk";
  const generate = opts.generate;
  const onSignal = typeof opts.onSignal === "function" ? opts.onSignal : null;

  const signal = (kind, subject) => {
    try { onSignal && onSignal({ kind, subject }); } catch (_e) {}
  };

  const applyCorrection = (candidate, source) => {
    const check = cvl.validateCorrection(context.input, finalText, candidate, { source });
    if (!check.accepted) {
      signal("cvl_reject", check.errors[0] || source);
      context.record({
        name: `cvl:${source}`,
        ok: false,
        confidence: check.confidence,
        errors: check.errors,
        detail: { keptOriginal: true },
      });
      return false;
    }
    finalText = check.answer;
    context.record({
      name: `cvl:${source}`,
      ok: true,
      confidence: check.confidence,
      detail: { accepted: true },
    });
    return true;
  };

  if (isSmalltalk) {
    context.record({ name: "cognitive:skip-smalltalk", ok: true, detail: { stoppedReason } });
    return { ok: true, answer: finalText, context };
  }

  await runStage(context, "rpre", async () => {
    const rp = rpre.verify(context.input, finalText);
    if (rp.applicable && rp.status === "REJECTED" && rp.correctedAnswer) {
      const accepted = applyCorrection(rp.correctedAnswer, "rpre");
      if (accepted) signal("rpre_reject", ((rp.checks || []).find((check) => !check.ok) || {}).name || "ratio_parts");
      return { ok: true, confidence: accepted ? 100 : 0, detail: { corrected: accepted } };
    }
    return { ok: true, confidence: rp.applicable ? 100 : null, detail: { applicable: !!rp.applicable } };
  });

  await runStage(context, "ebse", async () => {
    const eb = ebse.verify(context.input, finalText);
    if (eb.applicable && eb.status === "REJECTED" && eb.correctedAnswer) {
      const accepted = applyCorrection(eb.correctedAnswer, "ebse");
      if (accepted) signal("ebse_reject", ((eb.checks || []).find((check) => !check.ok) || {}).name || "back_substitution");
      return { ok: true, confidence: accepted ? 100 : 0, detail: { corrected: accepted } };
    }
    return { ok: true, confidence: eb.applicable ? 100 : null, detail: { applicable: !!eb.applicable } };
  });

  let mlvcApproved = false;
  if (opts.needsVerification && opts.needsMLVC) {
    await runStage(context, "mlvc", async () => {
      const mlvc = await verifyMathLogic(
        context.input,
        finalText,
        opts.deepReasoning && typeof generate === "function" ? generate : null,
        { passes: 1 }
      );
      if (mlvc.answer && mlvc.answer.trim()) applyCorrection(mlvc.answer.trim(), "mlvc");
      mlvcApproved = !!mlvc.approved;
      if (!mlvcApproved && mlvc.errors && mlvc.errors.length) signal("mlvc", mlvc.errors[0]);
      return {
        ok: mlvcApproved,
        confidence: mlvcApproved ? 100 : 0,
        errors: mlvc.errors || [],
        detail: { corrected: !!mlvc.answer },
      };
    }, { blocking: false });
  }

  if (opts.needsVerification && opts.deepReasoning && !mlvcApproved && typeof generate === "function") {
    await runStage(context, "ave", async () => {
      const verified = await verifyAnswer(context.input, finalText, generate, {
        categories: opts.reasoningCategories || [],
        passes: 1,
      });
      if (verified.answer && verified.answer.trim()) applyCorrection(verified.answer.trim(), "ave");
      return {
        ok: verified.ok !== false,
        confidence: verified.confidence || null,
        errors: verified.errors || [],
      };
    }, { blocking: false });
  }

  await runStage(context, "benchmark-repair", async () => {
    const repaired = repairBenchmarkAnswer(context.input, finalText);
    if (repaired.repaired && repaired.answer && repaired.answer.trim()) {
      const accepted = applyCorrection(repaired.answer.trim(), "benchmark-repair");
      return { ok: true, confidence: accepted ? 100 : 0, detail: { corrected: accepted } };
    }
    return { ok: true };
  });

  await runStage(context, "fact-lock:preservation", async () => {
    const check = factLock.validateFactPreservation(finalText, context.factLock);
    return {
      ok: check.ok,
      confidence: check.confidence,
      errors: check.errors,
      detail: {
        numericFacts: context.factLock ? context.factLock.numericFacts.map((item) => item.raw) : [],
      },
    };
  }, { blocking: true });

  await runStage(context, "hril", async () => {
    const interpreted = hril.interpret(context.input, finalText);
    if (interpreted.answer && interpreted.answer.trim()) applyCorrection(interpreted.answer.trim(), "hril");
    return { ok: true, confidence: interpreted.changed ? 100 : null, detail: { changed: !!interpreted.changed } };
  });

  await runStage(context, "ree", async () => {
    const explained = ree.explain(context.input, finalText);
    if (explained.answer && explained.answer.trim()) applyCorrection(explained.answer.trim(), "ree");
    return { ok: true, confidence: explained.changed ? 100 : null, detail: { changed: !!explained.changed } };
  });

  if (context.taskReport && context.taskReport.applicable) {
    await runStage(context, "task-registry:register", async () => {
      const summary = context.taskRegistry.hydrateFromAnswer(finalText);
      if (summary.complete) finalText = context.taskRegistry.mergeIntoAnswer(finalText);
      return {
        ok: true,
        confidence: summary.complete ? 100 : Math.max(0, Math.round((summary.answered / summary.expected) * 100)),
        detail: summary,
      };
    });

    await runStage(context, "sacv:semantic-completeness", async () => {
      if (context.taskRegistry && context.taskRegistry.isComplete()) {
        finalText = context.taskRegistry.mergeIntoAnswer(finalText);
      }
      let coverage = sacv.validateSemanticCompleteness(finalText, context.taskReport);
      if (!coverage.ok && typeof generate === "function") {
        signal("sacv_incomplete_tasks", coverage.errors[0] || "semantic completeness failed");
        const repaired = await generate(sacv.buildSemanticRepairMessages(context.input, finalText, context.taskReport, coverage));
        if (repaired && String(repaired).trim()) {
          applyCorrection(String(repaired).trim(), "sacv-repair");
          const interpreted = hril.interpret(context.input, finalText);
          if (interpreted.answer && interpreted.answer.trim()) applyCorrection(interpreted.answer.trim(), "hril-after-sacv");
          const explained = ree.explain(context.input, finalText);
          if (explained.answer && explained.answer.trim()) applyCorrection(explained.answer.trim(), "ree-after-sacv");
        }
        if (context.taskRegistry) {
          const summary = context.taskRegistry.hydrateFromAnswer(finalText);
          if (summary.complete) finalText = context.taskRegistry.mergeIntoAnswer(finalText);
        }
        coverage = sacv.validateSemanticCompleteness(finalText, context.taskReport);
      }
      const registryComplete = !context.taskRegistry || context.taskRegistry.isComplete();
      return {
        ok: coverage.ok && registryComplete,
        confidence: registryComplete ? coverage.confidence : 0,
        errors: [
          ...coverage.errors,
          ...(registryComplete ? [] : [`Task Registry incomplete: ${context.taskRegistry.missing().map((record) => record.task.label).join(", ")}`]),
        ],
        detail: {
          expected: coverage.expected,
          completed: coverage.completed.length,
          registry: context.taskRegistry ? context.taskRegistry.summary() : null,
        },
      };
    }, { blocking: true });
  }

  await runStage(context, "final-answer-sanitizer", async () => {
    let check = finalAnswerSanitizer.validateFinalAnswer(finalText, context.input, context.taskReport);
    if (check.cleanedAnswer) {
      applyCorrection(check.cleanedAnswer, "output-cleaner");
      check = finalAnswerSanitizer.validateFinalAnswer(finalText, context.input, context.taskReport);
    }
    if (!check.ok && typeof generate === "function") {
      signal("final_answer_sanitizer", check.errors[0]);
      const repaired = await generate(
        finalAnswerSanitizer.buildFinalAnswerRepairMessages(context.input, finalText, context.taskReport, check)
      );
      if (repaired && String(repaired).trim()) applyCorrection(String(repaired).trim(), "final-answer-sanitizer");
      check = finalAnswerSanitizer.validateFinalAnswer(finalText, context.input, context.taskReport);
      if (check.cleanedAnswer) {
        applyCorrection(check.cleanedAnswer, "output-cleaner-after-repair");
        check = finalAnswerSanitizer.validateFinalAnswer(finalText, context.input, context.taskReport);
      }
    }
    return {
      ok: check.ok,
      confidence: check.confidence,
      errors: check.errors,
      detail: { finalText: check.finalText },
    };
  }, { blocking: true });

  if (!context.blocked && opts.deepReasoning && opts.needsConclusion && typeof generate === "function") {
    await runStage(context, "mce", async () => {
      const concluded = await enforceConclusion(context.input, finalText, generate);
      if (concluded.answer && concluded.answer.trim()) applyCorrection(concluded.answer.trim(), "mce");
      return { ok: true, detail: { enforced: !!concluded.enforced } };
    });
  }

  if (!context.blocked) {
    await runStage(context, "rae:response-assembly", async () => {
      const assembled = rae.assembleResponse(context.input, finalText, context.taskRegistry);
      if (assembled.answer && assembled.answer.trim()) applyCorrection(assembled.answer.trim(), "rae");
      return { ok: true, confidence: assembled.confidence, detail: { changed: !!assembled.changed } };
    });
  }

  context.answer = context.blocked ? blockedAnswer(context) : finalText;
  return {
    ok: !context.blocked,
    answer: context.answer,
    context,
    stages: context.stageSummary(),
  };
}

module.exports = {
  createContext,
  runIntake,
  runPostValidation,
};
