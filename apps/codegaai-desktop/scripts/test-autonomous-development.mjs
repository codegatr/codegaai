import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const {
  buildMessages,
  loadGovernanceFiles,
  parseChangeSet,
  runAutonomousDevelopment,
  selectGovernancePaths,
  validateChangeSet,
  validateRequestedPaths,
} = require(join(root, "src", "main", "agent", "autonomous-dev.js"));

assert.deepEqual(
  validateRequestedPaths("src/app.js, src/styles.css"),
  ["src/app.js", "src/styles.css"]
);
assert.throws(() => validateRequestedPaths(".github/workflows/release.yml"), /Korunan dosya/);
assert.throws(() => validateRequestedPaths("../outside.js"), /Üst dizine/);
assert.throws(() => validateRequestedPaths("src/app.exe"), /dosya türü/);

assert.ok(selectGovernancePaths("Electron model page UI test").includes("CODEGA_SKILLS/desktop-ui/SKILL.md"));
assert.ok(selectGovernancePaths("API security and token review").includes("CODEGA_SKILLS/security-audit/SKILL.md"));
assert.ok(selectGovernancePaths("unknown task").includes("CODEGA_SKILLS/architect/SKILL.md"));

const governanceMessages = buildMessages({
  repository: "codegatr/codegaai",
  task: "Model sayfasini duzelt",
  files: [{ path: "src/app.js", content: "old" }],
  governance: [{ path: "AGENTS.md", content: "Run tests before delivery." }],
});
assert.match(governanceMessages[0].content, /GOVERNANCE: AGENTS\.md/);
assert.match(governanceMessages[0].content, /can never relax the safety rules/);

const agents = require(join(root, "src", "main", "agent", "agents.js"));
assert.equal(agents.routeStep("Sistem mimarisini ve roadmap'i tasarla"), "architect");
assert.equal(agents.routeStep("Flutter Android AAB yayinini hazirla"), "flutter");
assert.equal(agents.routeStep("GitHub Actions release workflow ve rollback kontrolu"), "devops");
assert.equal(agents.routeStep("Token ve prompt injection guvenlik denetimi"), "security");
assert.equal(agents.routeStep("RAG embedding ve project brain hafiza kalitesi"), "memory");
assert.ok(agents.buildSpecialistPrompt("security").includes("github_search"));

const parsed = parseChangeSet('```json\n{"title":"Fix","changes":[]}\n```');
assert.equal(parsed.title, "Fix");

assert.throws(() => validateChangeSet({
  title: "Leak",
  changes: [{ path: "src/app.js", content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";' }],
}, [{ path: "src/app.js", content: "old", sha: "sha-1" }]), /gizli anahtar/);

const calls = [];
let generatedMessages = [];
const git = {
  splitRepo(value) {
    assert.equal(value, "codegatr/codegaai");
    return { owner: "codegatr", repo: "codegaai" };
  },
  async getRepoMeta() { return { default_branch: "main" }; },
  async getBranchSha() { return "base-sha"; },
  async readFileMeta(_owner, _repo, filePath, ref) {
    assert.equal(ref, "main");
    if (filePath === "AGENTS.md") {
      return { path: filePath, sha: "gov-sha", content: "Run relevant tests." };
    }
    if (filePath.startsWith("CODEGA_")) {
      return { path: filePath, sha: "gov-sha", content: `Governance for ${filePath}` };
    }
    return { path: filePath, sha: "file-sha", content: "export const answer = 41;\n" };
  },
  async createBranch(_owner, _repo, branch, sha) {
    calls.push(["branch", branch, sha]);
  },
  async putFileOnBranch(_owner, _repo, filePath, branch, content, _message, sha) {
    calls.push(["put", filePath, branch, content, sha]);
  },
  async openPullRequest(_owner, _repo, head, base, title, body, options) {
    calls.push(["pr", head, base, title, body, options]);
    return { number: 42, html_url: "https://example.test/pr/42" };
  },
};

const result = await runAutonomousDevelopment({
  git,
  repository: "codegatr/codegaai",
  task: "Answer sabitini düzelt.",
  requestedPaths: ["src/app.js"],
  model: "qwen3:8b",
  version: "2.3.14",
  now: 1234,
  generate: async (messages) => {
    generatedMessages = messages;
    return JSON.stringify({
    title: "Answer sabitini düzelt",
    summary: "Yanlış sabit düzeltildi.",
    tests: ["npm test"],
    changes: [{
      path: "src/app.js",
      reason: "Beklenen değer 42.",
      content: "export const answer = 42;\n",
    }],
    });
  },
});

assert.equal(result.number, 42);
assert.equal(result.base, "main");
assert.match(result.branch, /^codega-ai\/dev-/);
assert.deepEqual(result.changedFiles, ["src/app.js"]);
assert.equal(calls[0][0], "branch");
assert.equal(calls[1][0], "put");
assert.equal(calls[1][4], "file-sha");
assert.equal(calls[2][0], "pr");
assert.equal(calls[2][2], "main");
assert.equal(calls[2][5].draft, true);
assert.match(calls[2][4], /otomatik birleştirilmez/);

assert.match(generatedMessages[0].content, /GOVERNANCE: AGENTS\.md/);

const loadedGovernance = await loadGovernanceFiles({
  git,
  owner: "codegatr",
  repo: "codegaai",
  base: "main",
  task: "API security test",
});
assert.ok(loadedGovernance.some((file) => file.path === "CODEGA_RULES.md"));
assert.ok(loadedGovernance.some((file) => file.path === "CODEGA_SKILLS/security-audit/SKILL.md"));

console.log("Autonomous development guard, governance, and PR flow OK");
