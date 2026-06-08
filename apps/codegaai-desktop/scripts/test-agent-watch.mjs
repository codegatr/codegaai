import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const watchModule = await import(pathToFileURL(join(root, "src", "main", "agent", "agent-watch.js")));
const systemModule = await import(pathToFileURL(join(root, "src", "main", "agent", "system-info.js")));
const watch = watchModule.default || watchModule;
const systemInfo = systemModule.default || systemModule;
const temp = mkdtempSync(join(tmpdir(), "codega-agent-watch-"));
process.env.CODEGA_AGENT_WATCH_PATH = join(temp, "state.json");

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function fetchFor({ sha, tag }) {
  return async (url) => {
    if (url.includes("/commits?")) {
      return response([{
        sha,
        html_url: `https://github.com/openai/codex/commit/${sha}`,
        commit: { message: `change ${sha}`, author: { date: "2026-06-07T10:00:00Z" } },
      }]);
    }
    if (url.endsWith("/releases/latest")) {
      return response({
        tag_name: tag,
        name: `Codex ${tag}`,
        html_url: `https://github.com/openai/codex/releases/tag/${tag}`,
        published_at: "2026-06-07T09:00:00Z",
      });
    }
    return response({
      html_url: "https://github.com/openai/codex",
      description: "Official coding agent",
      license: { spdx_id: "Apache-2.0" },
      stargazers_count: 123,
      default_branch: "main",
      pushed_at: "2026-06-07T10:00:00Z",
    });
  };
}

try {
  const sources = [{ id: "codex", label: "Codex", repo: "openai/codex", tier: "official" }];
  const first = await watch.scan({ sources, fetchImpl: fetchFor({ sha: "aaa", tag: "v1" }) });
  assert.equal(first.healthySources, 1);
  assert.equal(first.newCount, 1);
  assert.equal(first.findings[0].kind, "baseline");
  assert.equal(first.sources[0].policy.mode, "reviewable-reuse");
  assert.equal(first.sourceCount, 1);

  const unchanged = await watch.scan({ sources, fetchImpl: fetchFor({ sha: "aaa", tag: "v1" }) });
  assert.equal(unchanged.newCount, 0);

  const changed = await watch.scan({ sources, fetchImpl: fetchFor({ sha: "bbb", tag: "v2" }) });
  assert.equal(changed.newCount, 2);
  assert.ok(changed.findings.some((item) => item.kind === "release"));
  assert.ok(changed.findings.some((item) => item.kind === "commit"));
  assert.equal(watch.licensePolicy("UNKNOWN").mode, "research-only");
  assert.equal(watch.sourcePolicy("anthropics/claude-code", "NOASSERTION").mode, "official-reference");
  assert.equal(watch.sourcePolicy("VILA-Lab/Dive-into-Claude-Code", "CC-BY-NC-SA-4.0").mode, "research-only");
  assert.equal(watch.sourcePolicy("tanbiralam/claude-code", "MIT").mode, "blocked");
  assert.equal(watch.sourcePolicy("tanbiralam/claude-code", "MIT").contentPolicy, "metadata-only");
  assert.ok(watch.DEFAULT_SOURCES.some((source) => source.repo === "anthropics/claude-code"));
  assert.ok(watch.DEFAULT_SOURCES.some((source) => source.repo === "VILA-Lab/Dive-into-Claude-Code"));
  assert.ok(watch.DEFAULT_SOURCES.some((source) => source.repo === "tanbiralam/claude-code"));

  const cookbook = await systemInfo.analyzeCookbook(
    [{ id: "qwen3:8b", label: "Qwen3 8B", minVramGb: 7, minRamGb: 16, quality: 4 }],
    {
      os: {
        totalmem: () => 24 * 1024 ** 3,
        cpus: () => Array.from({ length: 16 }, () => ({ model: "Test CPU" })),
      },
      metrics: {
        gpuVram: async () => ({ name: "NVIDIA Test GPU", usedMB: 1024, totalMB: 6144, percent: 17 }),
      },
    },
  );
  assert.equal(cookbook.hardware.gpuName, "NVIDIA Test GPU");
  assert.equal(cookbook.hardware.vramGb, 6);
  assert.equal(cookbook.hardware.cores, 16);
  assert.equal(cookbook.hardware.gpuProbe, "nvidia-smi");
  assert.ok(cookbook.hardware.scannedAt > 0);

  console.log("Agent Watch and hardware scan tests OK");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
