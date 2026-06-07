import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const {
  parseChangeSet,
  runAutonomousDevelopment,
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

const parsed = parseChangeSet('```json\n{"title":"Fix","changes":[]}\n```');
assert.equal(parsed.title, "Fix");

assert.throws(() => validateChangeSet({
  title: "Leak",
  changes: [{ path: "src/app.js", content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";' }],
}, [{ path: "src/app.js", content: "old", sha: "sha-1" }]), /gizli anahtar/);

const calls = [];
const git = {
  splitRepo(value) {
    assert.equal(value, "codegatr/codegaai");
    return { owner: "codegatr", repo: "codegaai" };
  },
  async getRepoMeta() { return { default_branch: "main" }; },
  async getBranchSha() { return "base-sha"; },
  async readFileMeta(_owner, _repo, filePath, ref) {
    assert.equal(ref, "main");
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
  generate: async () => JSON.stringify({
    title: "Answer sabitini düzelt",
    summary: "Yanlış sabit düzeltildi.",
    tests: ["npm test"],
    changes: [{
      path: "src/app.js",
      reason: "Beklenen değer 42.",
      content: "export const answer = 42;\n",
    }],
  }),
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

console.log("Autonomous development guard and PR flow OK");
