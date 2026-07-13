"use strict";

const path = require("node:path");
const { extractFiles } = require("./extract-files");

const ZIP_ARCHIVE_RE = /\bZipArchive\b/i;
const ADD_FROM_STRING_RE = /->\s*addFromString\s*\(/i;
const GIANT_FILES_ARRAY_RE = /\$files\s*=\s*\[|\$files\s*=\s*array\s*\(/i;

function safeZipName(name = "codega-project") {
  const base = String(name || "codega-project").replace(/\.zip$/i, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "codega-project") + ".zip";
}

function langForPath(filePath = "") {
  const ext = path.extname(String(filePath).toLowerCase()).replace(".", "");
  if (ext === "htaccess") return "apache";
  if (["php", "html", "css", "js", "json", "sql", "md", "xml", "yml", "yaml", "txt"].includes(ext)) return ext;
  return "text";
}

function buildSeparateCodeBlockContract(o = {}) {
  const zipName = safeZipName(o.zipName || o.projectName || "codega-project");
  return [
    "## PROJECT FILE OUTPUT CONTRACT",
    "- Her dosyayi AYRI Markdown kod blogu olarak uret: ```php app/index.php",
    "- Kod blogu bilgi satirinda mutlaka relative file path bulunmali.",
    "- Tek dev ZipArchive script'i, addFromString veya $files = [...] dosya haritasi URETME.",
    "- Her dosya tamamlanabilir ve tek basina retry edilebilir olmalidir.",
    "- En sona ayrica ```php pack.php blogu ekle.",
    `- pack.php diskten dosyalari okuyup ZipArchive::addFile ile ${zipName} olusturmalidir.`,
  ].join("\n");
}

function buildPackPhp(o = {}) {
  const zipName = safeZipName(o.zipName || o.projectName || "codega-project");
  return [
    "<?php",
    "declare(strict_types=1);",
    "$root=realpath(__DIR__);",
    `$zipFile=$root.DIRECTORY_SEPARATOR.'${zipName.replace(/'/g, "")}';`,
    "if(!class_exists('ZipArchive')){http_response_code(500);exit(\"ZipArchive yok\\n\");}",
    "$zip=new ZipArchive();",
    "if($zip->open($zipFile,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true){http_response_code(500);exit(\"ZIP acilamadi\\n\");}",
    "$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS));",
    "foreach($it as $file){",
    "    if(!$file->isFile()) continue;",
    "    $path=$file->getPathname();",
    "    if($path===$zipFile || basename($path)==='pack.php') continue;",
    "    $rel=str_replace('\\\\','/',substr($path,strlen($root)+1));",
    "    if(preg_match('~(^|/)(\\\\.git|node_modules)/~',$rel)) continue;",
    "    $zip->addFile($path,$rel);",
    "}",
    "$zip->close();",
    "echo \"OK: \".basename($zipFile).\"\\n\";",
  ].join("\n");
}

function hasUnclosedFence(text = "") {
  const fences = String(text || "").match(/```/g);
  return !!fences && fences.length % 2 === 1;
}

function detectZipBundlingRisk(text = "") {
  const s = String(text || "");
  const hasZipArchive = ZIP_ARCHIVE_RE.test(s);
  const usesAddFromString = ADD_FROM_STRING_RE.test(s);
  const hasGiantFilesArray = GIANT_FILES_ARRAY_RE.test(s);
  return {
    hasZipArchive,
    usesAddFromString,
    hasGiantFilesArray,
    isRisky: hasZipArchive && (usesAddFromString || hasGiantFilesArray),
  };
}

function validateFileSet(files = []) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  for (const f of files) {
    const p = String(f && f.path || "").replace(/\\/g, "/");
    if (!p) errors.push("EMPTY_PATH");
    if (seen.has(p)) errors.push(`DUPLICATE_PATH:${p}`);
    seen.add(p);
    if (!String(f && f.content || "").trim()) warnings.push(`EMPTY_FILE:${p}`);
  }
  return { errors, warnings };
}

function ensurePackPhp(files = [], o = {}) {
  const hasPack = files.some((f) => String(f.path || "").replace(/\\/g, "/").toLowerCase() === "pack.php");
  if (hasPack) return files.slice();
  return files.concat([{ path: "pack.php", lang: "php", content: buildPackPhp(o) }]);
}

function retryInstructionFor(diagnostics = {}) {
  const parts = [];
  if (diagnostics.unclosedFence) parts.push("Kapanmamis kod blogu var; sadece yarim kalan dosyayi yeniden uret.");
  if (diagnostics.zipBundlingRisk && diagnostics.zipBundlingRisk.isRisky) {
    parts.push("Tek dev ZipArchive/addFromString bundling algilandi; dosyalari ayri code block olarak yeniden uret.");
  }
  if (!parts.length) parts.push("Eksik veya bos dosyalari tek tek tamamla.");
  return parts.join(" ");
}

function normalizeGeneratedProject(text = "", o = {}) {
  const files = extractFiles(text);
  const zipBundlingRisk = detectZipBundlingRisk(text);
  const base = validateFileSet(files);
  const unclosedFence = hasUnclosedFence(text);
  const errors = base.errors.slice();
  const warnings = base.warnings.slice();
  if (unclosedFence) errors.push("UNCLOSED_CODE_FENCE");
  if (zipBundlingRisk.isRisky) errors.push("MONOLITHIC_ZIP_BUNDLING");
  const diagnostics = {
    errors,
    warnings,
    unclosedFence,
    zipBundlingRisk,
    needsRetry: errors.length > 0 || files.length === 0,
  };
  return {
    files: ensurePackPhp(files, o),
    diagnostics,
    retryInstruction: retryInstructionFor(diagnostics),
  };
}

function renderFilesAsMarkdown(files = []) {
  return files.map((f) => {
    const filePath = String(f.path || "file.txt").replace(/\\/g, "/");
    const lang = f.lang || langForPath(filePath);
    return "```" + lang + " " + filePath + "\n" + String(f.content || "").replace(/\s+$/g, "") + "\n```";
  }).join("\n\n");
}

module.exports = {
  buildPackPhp,
  buildSeparateCodeBlockContract,
  detectZipBundlingRisk,
  ensurePackPhp,
  hasUnclosedFence,
  normalizeGeneratedProject,
  renderFilesAsMarkdown,
  retryInstructionFor,
  safeZipName,
  validateFileSet,
};
