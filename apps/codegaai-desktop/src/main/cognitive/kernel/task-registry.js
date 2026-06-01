"use strict";
/**
 * Persistent Task Registry
 * ------------------------
 * Stores per-task results across the cognitive execution lifecycle. Response
 * assembly must read from this registry instead of trusting the last draft text.
 */

const { finalAnswerText, trFold } = require("../../agent/final-answer-sanitizer");
const { solveDeterministic } = require("../../agent/mlvc");
const { buildSectionMap, extractResultTokens } = require("../../agent/sacv");

function tokenInText(text, token) {
  const hay = compact(text).replace(/,/g, ".");
  const needle = compact(token).replace(/,/g, ".");
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  if (/^-?\d+(?:\.\d+)?$/.test(needle)) {
    const n = Number(needle);
    return (hay.match(/-?\d+(?:\.\d+)?/g) || []).some((v) => Math.abs(Number(v) - n) < 0.0001);
  }
  return false;
}

function expectedTokensFor(task) {
  const solved = solveDeterministic(task.body || "");
  if (!solved) return [];
  return extractResultTokens(finalAnswerText(solved) || solved);
}

function compact(text) {
  return trFold(text).replace(/\s+/g, " ").trim();
}

function stripTaskPrefix(text, task) {
  let out = String(text || "").trim();
  const id = String(task && task.id || "").trim();
  const labels = [
    task && task.label,
    id ? `Test ${id}` : "",
    id ? `Soru ${id}` : "",
    id ? `Gorev ${id}` : "",
    id ? `Görev ${id}` : "",
  ].filter(Boolean);
  for (const label of labels) {
    const re = new RegExp(`^\\s*${String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:.)-]?\\s*`, "i");
    out = out.replace(re, "").trim();
  }
  if (id) {
    const bareId = new RegExp(`^\\s*${String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:.)-]\\s*`, "i");
    out = out.replace(bareId, "").trim();
  }
  return out;
}

function splitFinalUnits(text) {
  return String(text || "")
    .split(/\s*(?:\||\n+|;)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function taskMatchesUnit(task, unit) {
  const u = compact(unit);
  const id = compact(task.id);
  const label = compact(task.label);
  const patterns = [label, id ? `test ${id}` : "", id ? `soru ${id}` : "", id ? `${id}:` : ""].filter(Boolean);
  return patterns.some((pattern) => u.includes(pattern));
}

function deterministicResultFor(task) {
  const solved = solveDeterministic(task.body || "");
  if (!solved) return null;
  const final = finalAnswerText(solved) || solved;
  const unit = splitFinalUnits(final).find((part) => taskMatchesUnit(task, part)) || final;
  const result = stripTaskPrefix(unit, task);
  if (!result) return null;
  return {
    result,
    reasoning: solved.replace(/\n*Final Answer:[\s\S]*$/i, "").trim(),
    verification: "Deterministic solver result registered and preserved.",
    verified: true,
    source: "deterministic",
  };
}

class TaskRegistry {
  constructor(tasks = []) {
    this.records = tasks.map((task, index) => ({
      task,
      taskId: String(task.id || index + 1),
      index,
      result: "",
      reasoning: "",
      verification: "",
      verified: false,
      source: "",
    }));
  }

  add(taskId, payload = {}) {
    const record = this.records.find((item) => item.taskId === String(taskId));
    if (!record) return false;
    if (payload.result) record.result = String(payload.result).trim();
    if (payload.reasoning) record.reasoning = String(payload.reasoning).trim();
    if (payload.verification) record.verification = String(payload.verification).trim();
    if (payload.source) record.source = String(payload.source);
    if (payload.verified != null) record.verified = !!payload.verified;
    return true;
  }

  hydrateFromAnswer(answer) {
    const final = finalAnswerText(answer) || "";
    const units = splitFinalUnits(final);
    const used = new Set();
    const sectionMap = buildSectionMap(final, this.records.map((r) => r.task));

    // 1) Açık etiket/id eşleşmesi (birim)
    for (const record of this.records) {
      const explicitIndex = units.findIndex((unit, index) => !used.has(index) && taskMatchesUnit(record.task, unit));
      if (explicitIndex >= 0) {
        used.add(explicitIndex);
        this.add(record.taskId, {
          result: stripTaskPrefix(units[explicitIndex], record.task),
          verified: true,
          source: "explicit-final-answer",
        });
      }
    }

    // 2) Etiket bölümü eşleşmesi (id -> bölüm); sıra-bağımsız
    for (const record of this.records) {
      if (record.result) continue;
      const section = sectionMap.get(String(record.taskId));
      if (section) {
        const result = stripTaskPrefix(section.replace(/\s+/g, " ").trim(), record.task);
        if (result) this.add(record.taskId, { result, verified: true, source: "label-section" });
      }
    }

    // 3) Deterministik çözüm (solver biliyorsa)
    for (const record of this.records) {
      if (record.result && record.verified) continue;
      const deterministic = deterministicResultFor(record.task);
      if (deterministic) this.add(record.taskId, deterministic);
    }

    // 4) Sayısal/token eşleşmesi: solverın beklediği token'ı içeren birimi ata
    for (const record of this.records) {
      if (record.result) continue;
      const tokens = expectedTokensFor(record.task);
      if (!tokens.length) continue;
      const tokenIndex = units.findIndex((unit, index) => !used.has(index) && tokens.some((t) => tokenInText(unit, t)));
      if (tokenIndex >= 0) {
        used.add(tokenIndex);
        this.add(record.taskId, {
          result: stripTaskPrefix(units[tokenIndex], record.task),
          verified: true,
          source: "numeric-token",
        });
      }
    }

    // 5) Sıralı yedek (yalnız kalan boşluklar için)
    if (units.length >= this.records.length) {
      for (const record of this.records) {
        if (record.result) continue;
        const unitIndex = units.findIndex((unit, index) => !used.has(index));
        if (unitIndex >= 0) {
          used.add(unitIndex);
          this.add(record.taskId, {
            result: stripTaskPrefix(units[unitIndex], record.task),
            verified: true,
            source: "sequential-final-answer",
          });
        }
      }
    }

    return this.summary();
  }

  isComplete() {
    return this.records.length > 0 && this.records.every((record) => record.result && record.verified);
  }

  answeredCount() {
    return this.records.filter((record) => record.result && record.verified).length;
  }

  missing() {
    return this.records.filter((record) => !record.result || !record.verified);
  }

  toFinalAnswerString() {
    return this.records
      .filter((record) => record.result)
      .map((record) => `${record.task.label}: ${record.result}`)
      .join(" | ");
  }

  mergeIntoAnswer(answer) {
    if (!this.isComplete()) return String(answer || "").trim();
    const final = this.toFinalAnswerString();
    const text = String(answer || "").trim();
    if (/Final Answer:/i.test(text)) {
      return text.replace(/Final Answer:\s*[\s\S]*$/i, `Final Answer: ${final}`).trim();
    }
    return `${text}\n\nFinal Answer: ${final}`.trim();
  }

  summary() {
    return {
      expected: this.records.length,
      answered: this.answeredCount(),
      complete: this.isComplete(),
      missing: this.missing().map((record) => record.task.label),
      records: this.records.map((record) => ({
        taskId: record.taskId,
        label: record.task.label,
        result: record.result,
        verified: record.verified,
        source: record.source,
      })),
    };
  }
}

module.exports = {
  TaskRegistry,
  deterministicResultFor,
  splitFinalUnits,
  stripTaskPrefix,
};
