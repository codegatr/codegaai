"use strict";

function evaluateAutonomousRun({
  settings = {},
  hasToken = false,
  drafts = [],
  now = Date.now(),
  lastActivityAt = 0,
} = {}) {
  if (!settings.autonomousDevelopment) return { ready: false, reason: "development-disabled" };
  if (!settings.autonomousDevelopmentSchedule) return { ready: false, reason: "schedule-disabled" };
  if (!hasToken) return { ready: false, reason: "github-unavailable" };

  const repository = String(settings.autonomousDevelopmentRepo || settings.knowledgeRepo || "").trim();
  const requestedPaths = String(settings.autonomousDevelopmentPaths || "").trim();
  if (!repository || !requestedPaths) return { ready: false, reason: "targets-missing" };
  if (now - Number(lastActivityAt || 0) < 10 * 60 * 1000) return { ready: false, reason: "user-active" };

  const intervalHours = Math.max(1, Math.min(168, Number(settings.autonomousDevelopmentIntervalHours) || 24));
  const lastRun = Number(settings.autonomousDevelopmentLastRun) || 0;
  if (lastRun && now - lastRun < intervalHours * 60 * 60 * 1000) {
    return { ready: false, reason: "interval-pending" };
  }

  const draft = (Array.isArray(drafts) ? drafts : []).find((item) => item && !item.proposedAt);
  if (!draft) return { ready: false, reason: "no-observation" };

  return {
    ready: true,
    repository,
    requestedPaths,
    intervalHours,
    draft,
    task: [
      `Observed issue: ${String(draft.idea || "").trim()}`,
      `Evidence: ${String(draft.rationale || "").trim()}`,
      "Implement the smallest safe fix in the allowed files. Preserve unrelated behavior and include concrete regression tests.",
    ].join("\n"),
  };
}

module.exports = { evaluateAutonomousRun };
