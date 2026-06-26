"use strict";

const { createFile, createManifest, renderManifestSummary } = require("./file-manifest");
const { buildServiceAutomationProject } = require("./service-automation-project");

function buildProjectFromPrompt(prompt, options = {}) {
  const text = String(prompt || "").toLocaleLowerCase("tr");
  if (/(ates fiat|ateş fiat|servis otomasyon|iş emri|is emri|fiat servis)/.test(text)) {
    return buildServiceAutomationProject(options);
  }
  return createManifest({
    projectName: options.projectName || "phoenix-project",
    files: [
      createFile("README.md", `# Phoenix Project\n\nİstek:\n\n${String(prompt || "").trim()}\n`, "docs"),
    ],
    meta: { kind: "generic", exportReady: true },
  });
}

module.exports = {
  createFile,
  createManifest,
  renderManifestSummary,
  buildServiceAutomationProject,
  buildProjectFromPrompt,
};
