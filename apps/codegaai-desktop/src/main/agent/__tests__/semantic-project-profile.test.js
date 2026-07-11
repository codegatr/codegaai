"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  profilePath,
  loadSemanticProjectProfile,
  saveSemanticProjectProfile,
  extractProjectProfileFacts,
  buildProjectProfileContext,
} = require("../memory/semantic-project-profile");
const { ModelManager } = require("../../model-manager");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codega-profile-"));
}

describe("semantic-project-profile", () => {
  test("profile path is pinned to .codegaai.json inside project root", () => {
    const dir = tmpDir();
    expect(profilePath(dir)).toBe(path.join(path.resolve(dir), ".codegaai.json"));
  });

  test("extracts durable engineering facts and stores them without duplicates", () => {
    const dir = tmpDir();
    const facts = extractProjectProfileFacts(
      "CODEGA local-first privacy-first multi-model Ollama Claude OpenAI. " +
      "Frameworkless procedural PHP with PDO bindParam. Abort char_salad and ON JOIN."
    );
    saveSemanticProjectProfile(dir, facts);
    saveSemanticProjectProfile(dir, facts);
    const profile = loadSemanticProjectProfile(dir);
    expect(profile.facts.architectureRules).toContain("CODEGA AI must stay local-first and privacy-first.");
    expect(profile.facts.guardrails.some((x) => x.includes("ON JOIN"))).toBe(true);
    expect(profile.facts.guardrails.length).toBe(new Set(profile.facts.guardrails).size);
  });

  test("builds compact system context for the next turn", () => {
    const dir = tmpDir();
    saveSemanticProjectProfile(dir, {
      architectureRules: ["Keep CODEGA local-first."],
      forbiddenLibraries: ["Avoid heavy frameworks for frameworkless requests."],
    });
    const context = buildProjectProfileContext(loadSemanticProjectProfile(dir));
    expect(context).toMatch(/PROJECT SEMANTIC PROFILE/);
    expect(context).toMatch(/Keep CODEGA local-first/);
    expect(context).toMatch(/forbiddenLibraries/);
  });

  test("askDirect loads project profile as system context when projectRoot is provided", async () => {
    const dir = tmpDir();
    saveSemanticProjectProfile(dir, {
      architectureRules: ["Use the hybrid guardrail router for local model collapse."],
    });
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen3:8b"];
    let captured = [];
    mgr.generate = async (_model, messages) => {
      captured = messages;
      return "Tamam, guardrail router baglamini dikkate aliyorum.";
    };
    const res = await mgr.askDirect("char_salad ON JOIN olursa ne yaparsin?", {
      chatId: "semantic-profile",
      projectRoot: dir,
    });
    expect(res.source).toBe("direct");
    expect(captured.some((m) => m.role === "system" && /PROJECT SEMANTIC PROFILE/.test(m.content))).toBe(true);
    expect(captured.some((m) => /hybrid guardrail router/.test(m.content))).toBe(true);
    const updated = loadSemanticProjectProfile(dir);
    expect(updated.facts.guardrails.some((x) => x.includes("ON JOIN"))).toBe(true);
  });
});
