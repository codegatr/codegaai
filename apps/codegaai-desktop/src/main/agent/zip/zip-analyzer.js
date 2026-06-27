"use strict";

/**
 * ZipAnalyzer — ZIP arşivindeki proje yapısını analiz eder.
 *
 * Tespit edilen bilgiler:
 *   - Stack (PHP/Laravel/Node/React/Vue/Next/Flutter/.NET/Electron vb.)
 *   - Kök dosyalar ve klasörler
 *   - Toplam dosya sayısı / boyut
 *   - AI'ya gönderilecek özet (dosya ağacı + stack)
 */

const path = require("node:path");
const { list, readFile } = require("./zip-engine");

const STACK_SIGNATURES = [
  // PHP / Laravel
  { stack: "Laravel",    files: ["artisan", "composer.json"],          keywords: ["laravel/framework"] },
  { stack: "PHP",        files: ["index.php", "composer.json"],        keywords: [] },
  // Node.js
  { stack: "Next.js",    files: ["next.config.js", "next.config.mjs"], keywords: ["next"] },
  { stack: "NestJS",     files: ["nest-cli.json"],                     keywords: ["@nestjs/core"] },
  { stack: "Express",    files: ["package.json"],                      keywords: ["express"] },
  { stack: "Node.js",    files: ["package.json", "index.js"],          keywords: [] },
  // Frontend
  { stack: "React",      files: ["package.json"],                      keywords: ["react-dom"] },
  { stack: "Vue",        files: ["vue.config.js", "package.json"],     keywords: ["vue"] },
  { stack: "Svelte",     files: ["svelte.config.js"],                  keywords: [] },
  // Desktop
  { stack: "Electron",   files: ["package.json"],                      keywords: ["electron"] },
  // Mobile
  { stack: "Flutter",    files: ["pubspec.yaml"],                      keywords: [] },
  { stack: "React Native",files: ["app.json", "package.json"],         keywords: ["react-native"] },
  // .NET
  { stack: ".NET",       files: [".csproj", ".sln"],                   keywords: [] },
  // Python
  { stack: "FastAPI",    files: ["requirements.txt", "main.py"],       keywords: ["fastapi"] },
  { stack: "Django",     files: ["manage.py"],                         keywords: [] },
  { stack: "Python",     files: ["requirements.txt", "setup.py"],      keywords: [] },
];

const IMPORTANT_FILES = [
  "package.json", "composer.json", "pubspec.yaml", "requirements.txt",
  "Dockerfile", "docker-compose.yml", ".env.example", "README.md",
  ".gitignore", "artisan", "manage.py", "next.config.js",
];

const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".php", ".py", ".rb", ".go", ".rs", ".java", ".cs",
  ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".json", ".yaml", ".yml", ".toml", ".env", ".env.example",
  ".md", ".txt", ".sh", ".bat", ".ps1", ".sql",
  ".xml", ".svg", ".vue", ".svelte", ".dart",
]);

function isText(filename) {
  const ext = path.extname(filename).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || IMPORTANT_FILES.includes(path.basename(filename));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * ZIP içindeki dosya ağacını metin olarak oluşturur (AI'ya göndermek için).
 * @param {Array} entries
 * @param {number} maxLines
 */
function buildTree(entries, maxLines = 200) {
  const lines = [];
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const e of sorted) {
    if (lines.length >= maxLines) {
      lines.push(`... (${entries.length - lines.length} dosya daha)`);
      break;
    }
    const icon = e.isDir ? "📁" : "📄";
    lines.push(`${icon} ${e.name} ${e.isDir ? "" : `(${formatSize(e.size)})`}`);
  }
  return lines.join("\n");
}

/**
 * Yalnızca ZIP local headers'dan dosya listesini okuyarak stack tespiti yapar.
 * Büyük binary dosyaları okumaz.
 * @param {string} zipPath
 * @returns {Promise<object>} analiz sonucu
 */
async function analyzeZip(zipPath) {
  const entries = await list(zipPath);
  const names = entries.map((e) => e.name);
  const basenames = names.map((n) => path.basename(n));

  // Stack tespiti
  let detectedStack = "Unknown";
  let stackConfidence = 0;

  // Önemli dosyaları oku (package.json, composer.json vb.)
  let packageJsonContent = null;
  let composerContent = null;

  for (const entry of entries) {
    if (!entry.isDir && path.basename(entry.name) === "package.json" && !entry.name.includes("node_modules")) {
      try {
        const buf = await readFile(zipPath, entry.name);
        packageJsonContent = JSON.parse(buf.toString("utf8"));
      } catch (_e) {}
      break;
    }
  }

  for (const entry of entries) {
    if (!entry.isDir && path.basename(entry.name) === "composer.json") {
      try {
        const buf = await readFile(zipPath, entry.name);
        composerContent = JSON.parse(buf.toString("utf8"));
      } catch (_e) {}
      break;
    }
  }

  const allDeps = [
    ...Object.keys(packageJsonContent?.dependencies || {}),
    ...Object.keys(packageJsonContent?.devDependencies || {}),
    ...Object.keys(composerContent?.require || {}),
  ].join(" ");

  for (const sig of STACK_SIGNATURES) {
    const fileHit = sig.files.some((f) =>
      f.startsWith(".") ? names.some((n) => n.endsWith(f)) : basenames.includes(f)
    );
    const kwHit = sig.keywords.length === 0 || sig.keywords.some((kw) => allDeps.includes(kw));
    if (fileHit && kwHit) {
      detectedStack = sig.stack;
      stackConfidence = sig.keywords.length > 0 ? 0.95 : 0.75;
      break;
    }
  }

  // İstatistikler
  const totalFiles = entries.filter((e) => !e.isDir).length;
  const totalDirs  = entries.filter((e) => e.isDir).length;
  const totalBytes = entries.reduce((s, e) => s + (e.size || 0), 0);

  // Kök seviyesi yapısı
  const rootItems = [...new Set(
    names.map((n) => n.split("/")[0]).filter(Boolean)
  )].sort();

  // Önemli dosyalar (var olanlar)
  const presentImportant = IMPORTANT_FILES.filter((f) => basenames.includes(f));

  // Dosya türü dağılımı
  const extCount = {};
  for (const e of entries) {
    if (!e.isDir) {
      const ext = path.extname(e.name).toLowerCase() || "(no ext)";
      extCount[ext] = (extCount[ext] || 0) + 1;
    }
  }
  const topExts = Object.entries(extCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ext, n]) => `${ext}(${n})`);

  const tree = buildTree(entries);

  const summary = [
    `Stack: ${detectedStack}${stackConfidence ? ` (${Math.round(stackConfidence * 100)}%)` : ""}`,
    `Dosyalar: ${totalFiles} dosya, ${totalDirs} klasör, toplam ${formatSize(totalBytes)}`,
    `Kök: ${rootItems.slice(0, 10).join(", ")}`,
    `Önemli dosyalar: ${presentImportant.join(", ") || "—"}`,
    `Uzantılar: ${topExts.join(", ")}`,
    `\nDosya ağacı:\n${tree}`,
  ].join("\n");

  return {
    stack: detectedStack,
    stackConfidence,
    totalFiles,
    totalDirs,
    totalBytes,
    totalBytesFormatted: formatSize(totalBytes),
    rootItems,
    importantFiles: presentImportant,
    extensions: extCount,
    entries,
    packageJson: packageJsonContent,
    composerJson: composerContent,
    summary,
    tree,
  };
}

/**
 * ZIP içindeki belirli bir text dosyasının içeriğini okur.
 * Binary/büyük dosyalar için hata döner.
 * @param {string} zipPath
 * @param {string} entryName
 * @param {number} maxBytes
 */
async function readTextFile(zipPath, entryName, maxBytes = 100000) {
  if (!isText(entryName)) throw new Error(`Binary dosya okunamaz: ${entryName}`);
  const buf = await readFile(zipPath, entryName);
  if (buf.length > maxBytes) {
    return buf.slice(0, maxBytes).toString("utf8") + `\n\n... (${formatSize(buf.length - maxBytes)} kesildi)`;
  }
  return buf.toString("utf8");
}

module.exports = { analyzeZip, readTextFile, isText, formatSize };
