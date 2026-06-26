"use strict";

const { serviceAutomationFiles } = require("./service-automation-template");

function slugify(value) {
  return String(value || "phoenix-project")
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/[ğ]/g, "g")
    .replace(/[ü]/g, "u")
    .replace(/[ş]/g, "s")
    .replace(/[ö]/g, "o")
    .replace(/[ç]/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "phoenix-project";
}

function detectProjectKind(prompt) {
  const text = String(prompt || "").toLocaleLowerCase("tr");
  if (/(servis|fiat|araç|arac|iş emri|is emri|otomasyon)/.test(text)) return "service_automation";
  return "generic";
}

function buildProject(prompt) {
  const kind = detectProjectKind(prompt);
  const projectName = kind === "service_automation" ? "ates-fiat-servis" : slugify(prompt);
  const files = kind === "service_automation"
    ? serviceAutomationFiles(projectName)
    : [{ path: "README.md", content: `# ${projectName}\n\nPhoenix Project Builder tarafından oluşturuldu.\n` }];

  return {
    ok: true,
    kind,
    projectName,
    files,
    summary: `${files.length} dosyalı ${projectName} proje iskeleti hazırlandı.`,
  };
}

function renderProjectResponse(project) {
  const lines = [
    `Phoenix Project Builder: ${project.projectName}`,
    "",
    project.summary,
    "",
    "Üretilecek dosyalar:",
    ...project.files.map((file) => `- ${file.path}`),
    "",
    "İlk dosya içerikleri hazır. Sonraki adım: ZIP/klasör olarak dışa aktarma.",
  ];
  return lines.join("\n");
}

module.exports = {
  buildProject,
  renderProjectResponse,
};
