"use strict";

const path = require("node:path");
const { slugify } = require("./self-improve");

const MAX_FILES = 4;
const MAX_FILE_BYTES = 24 * 1024;
const MAX_TOTAL_BYTES = 72 * 1024;
const ALLOWED_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".ts"]);
const FORBIDDEN_PATHS = [
  /^\.env(?:\.|$)/i,
  /^\.github\/workflows\//i,
  /(^|\/)(package-lock|npm-shrinkwrap|yarn\.lock|pnpm-lock)\./i,
  /(^|\/)(secrets?|credentials?|tokens?)(\/|\.|$)/i,
  /src\/main\/(?:update-service|preload)\.js$/i,
  /src\/main\/agent\/(?:github-client|settings-store)\.js$/i,
];
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

function normalizeRepoPath(value) {
  const clean = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.includes("\0")) throw new Error("Dosya yolu boş veya geçersiz.");
  if (clean.split("/").includes("..")) throw new Error(`Üst dizine çıkan yol reddedildi: ${clean}`);
  return clean;
}

function validateRequestedPaths(input) {
  const paths = Array.from(new Set(
    (Array.isArray(input) ? input : String(input || "").split(/[\n,]/))
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map(normalizeRepoPath)
  ));
  if (!paths.length) throw new Error("En az bir hedef dosya yolu gerekli.");
  if (paths.length > MAX_FILES) throw new Error(`Bir görevde en fazla ${MAX_FILES} dosya değiştirilebilir.`);
  for (const filePath of paths) {
    if (FORBIDDEN_PATHS.some((rule) => rule.test(filePath))) {
      throw new Error(`Korunan dosya otonom değişikliğe kapalı: ${filePath}`);
    }
    if (!ALLOWED_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase())) {
      throw new Error(`Bu dosya türü otonom değişikliğe kapalı: ${filePath}`);
    }
  }
  return paths;
}

function stripCodeFence(value) {
  const text = String(value || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

function parseChangeSet(value) {
  const text = stripCodeFence(value);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Model geçerli JSON değişiklik seti üretmedi.");
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (_secondError) {
      throw new Error("Model çıktısındaki JSON ayrıştırılamadı.");
    }
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.changes)) {
    throw new Error("Model çıktısında changes dizisi yok.");
  }
  return parsed;
}

function validateChangeSet(changeSet, sourceFiles) {
  const sourceMap = new Map(sourceFiles.map((file) => [file.path, file]));
  if (!changeSet.changes.length) throw new Error("Model hiçbir kod değişikliği üretmedi.");
  if (changeSet.changes.length > MAX_FILES) throw new Error("Model izin verilenden fazla dosya değiştirmeye çalıştı.");

  const seen = new Set();
  let totalBytes = 0;
  const changes = changeSet.changes.map((raw) => {
    const filePath = normalizeRepoPath(raw && raw.path);
    if (seen.has(filePath)) throw new Error(`Aynı dosya iki kez üretildi: ${filePath}`);
    seen.add(filePath);
    const source = sourceMap.get(filePath);
    if (!source) throw new Error(`Model okunmamış bir dosyayı değiştirmeye çalıştı: ${filePath}`);
    validateRequestedPaths([filePath]);

    const content = String(raw.content ?? "");
    const bytes = Buffer.byteLength(content, "utf8");
    if (!content.trim()) throw new Error(`Boş dosya yazma girişimi reddedildi: ${filePath}`);
    if (bytes > MAX_FILE_BYTES) throw new Error(`Dosya değişikliği çok büyük: ${filePath}`);
    if (content === source.content) throw new Error(`Dosyada gerçek değişiklik yok: ${filePath}`);
    if (SECRET_PATTERNS.some((rule) => rule.test(content))) {
      throw new Error(`Muhtemel gizli anahtar içeren değişiklik reddedildi: ${filePath}`);
    }
    totalBytes += bytes;
    return {
      path: filePath,
      content,
      reason: String(raw.reason || "").trim().slice(0, 500),
      sha: source.sha,
    };
  });
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Toplam değişiklik boyutu güvenli sınırı aşıyor.");

  return {
    title: String(changeSet.title || "Otonom kod iyileştirmesi").trim().slice(0, 90),
    summary: String(changeSet.summary || "").trim().slice(0, 2000),
    tests: Array.isArray(changeSet.tests)
      ? changeSet.tests.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : [],
    changes,
  };
}

function buildMessages({ task, files, repository }) {
  const fileBlocks = files.map((file) => [
    `--- FILE: ${file.path} ---`,
    file.content,
    `--- END FILE: ${file.path} ---`,
  ].join("\n")).join("\n\n");
  return [
    {
      role: "system",
      content: [
        "You are CODEGA AI's audited software development worker.",
        "Return JSON only. Do not use markdown fences.",
        "Modify only the supplied files and preserve unrelated behavior.",
        "Never add credentials, telemetry, destructive commands, or hidden network calls.",
        "Each change must contain the COMPLETE replacement file content.",
        'Schema: {"title":"...","summary":"...","tests":["..."],"changes":[{"path":"...","reason":"...","content":"complete file"}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Repository: ${repository}`,
        `Task: ${String(task || "").trim()}`,
        "",
        "Read the supplied files, implement the smallest correct change, and describe suitable tests.",
        "",
        fileBlocks,
      ].join("\n"),
    },
  ];
}

function buildPullRequestBody({ task, validated, model, version }) {
  const files = validated.changes.map((change) =>
    `- \`${change.path}\`${change.reason ? `: ${change.reason}` : ""}`
  );
  const tests = validated.tests.length
    ? validated.tests.map((test) => `- [ ] ${test}`)
    : ["- [ ] GitHub Actions doğrulama paketi"];
  return [
    "## CODEGA AI Otonom Geliştirme",
    "",
    `**Görev:** ${String(task || "").trim()}`,
    "",
    validated.summary || "Model, hedef dosyalarda sınırlı bir değişiklik seti hazırladı.",
    "",
    "### Değişen dosyalar",
    ...files,
    "",
    "### Doğrulama",
    ...tests,
    "",
    "### Güvenlik sınırı",
    "- Değişiklik ayrı bir dalda üretildi.",
    "- Bu PR taslaktır ve otomatik birleştirilmez.",
    "- Korunan dosyalar, workflow'lar ve gizli anahtarlar değişiklik kapsamı dışındadır.",
    "",
    `Üreten model: \`${model || "bilinmiyor"}\` · CODEGA AI ${version || ""}`,
  ].join("\n");
}

async function runAutonomousDevelopment({
  git,
  repository,
  task,
  requestedPaths,
  generate,
  model,
  version,
  now = Date.now(),
}) {
  if (!git || typeof generate !== "function") throw new Error("Geliştirme ajanı bağımlılıkları eksik.");
  if (!String(task || "").trim()) throw new Error("Geliştirme görevi boş olamaz.");
  const paths = validateRequestedPaths(requestedPaths);
  const { owner, repo } = git.splitRepo(repository);
  const meta = await git.getRepoMeta(owner, repo);
  const base = (meta && meta.default_branch) || "main";
  const baseSha = await git.getBranchSha(owner, repo, base);
  if (!baseSha) throw new Error(`Taban dal SHA bulunamadı (${base}).`);

  const files = [];
  let sourceBytes = 0;
  for (const filePath of paths) {
    const file = await git.readFileMeta(owner, repo, filePath, base);
    const bytes = Buffer.byteLength(file.content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new Error(`Kaynak dosya model bağlamı için çok büyük: ${filePath}`);
    sourceBytes += bytes;
    if (sourceBytes > MAX_TOTAL_BYTES) throw new Error("Hedef dosyaların toplamı güvenli bağlam sınırını aşıyor.");
    files.push({ path: filePath, content: file.content, sha: file.sha });
  }

  const raw = await generate(buildMessages({ task, files, repository }));
  const validated = validateChangeSet(parseChangeSet(raw), files);
  const branch = `codega-ai/dev-${slugify(validated.title)}-${now}`;
  await git.createBranch(owner, repo, branch, baseSha);
  for (const change of validated.changes) {
    await git.putFileOnBranch(
      owner,
      repo,
      change.path,
      branch,
      change.content,
      `CODEGA AI: ${validated.title}`,
      change.sha
    );
  }

  const body = buildPullRequestBody({ task, validated, model, version });
  const pr = await git.openPullRequest(
    owner,
    repo,
    branch,
    base,
    `[CODEGA AI] ${validated.title}`,
    body,
    { draft: true }
  );
  return {
    url: (pr && pr.html_url) || "",
    number: pr && pr.number,
    branch,
    base,
    title: validated.title,
    changedFiles: validated.changes.map((change) => change.path),
    tests: validated.tests,
  };
}

module.exports = {
  MAX_FILES,
  buildMessages,
  buildPullRequestBody,
  normalizeRepoPath,
  parseChangeSet,
  runAutonomousDevelopment,
  validateChangeSet,
  validateRequestedPaths,
};
