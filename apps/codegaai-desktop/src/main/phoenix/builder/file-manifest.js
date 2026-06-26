"use strict";

function createFile(path, content, role = "code") {
  return {
    path: String(path || "").replace(/\\/g, "/"),
    content: String(content || ""),
    role,
    size: Buffer.byteLength(String(content || ""), "utf8"),
  };
}

function createManifest({ projectName, files = [], meta = {} } = {}) {
  const normalizedFiles = files.map((file) => createFile(file.path, file.content, file.role));
  return {
    schema: "codega.phoenix.project-manifest.v1",
    projectName: projectName || "phoenix-project",
    fileCount: normalizedFiles.length,
    totalBytes: normalizedFiles.reduce((sum, file) => sum + file.size, 0),
    createdAt: new Date().toISOString(),
    meta,
    files: normalizedFiles,
  };
}

function renderManifestSummary(manifest) {
  return [
    `Phoenix Project Builder: ${manifest.projectName}`,
    "",
    `Dosya sayısı: ${manifest.fileCount}`,
    `Toplam boyut: ${manifest.totalBytes} byte`,
    "",
    "Dosyalar:",
    ...manifest.files.map((file) => `- ${file.path} (${file.role})`),
  ].join("\n");
}

module.exports = {
  createFile,
  createManifest,
  renderManifestSummary,
};
