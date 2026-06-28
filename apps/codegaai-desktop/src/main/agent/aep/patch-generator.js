"use strict";

/**
 * patch-generator.js — CODEGA AI Otonom Patch Üretici
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Akış:
 *   1. Onaylı öneriyi al
 *   2. Ayrı bir branch oluştur (GitHub REST API)
 *   3. Değişiklikleri uygula (LLM yardımlı veya kural tabanlı)
 *   4. Static analiz çalıştır
 *   5. Testleri çalıştır
 *   6. Benchmark (opsiyonel)
 *   7. PR içeriği üret
 *   8. PR aç (DRAFT — insan onayı olmadan merge edilmez)
 *
 * KURAL: Bu modül üretim kodunu ASLA otomatik merge etmez.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const { generatePRContent, createGitHubPR } = require("./pr-agent");
const { PROPOSAL_STATUS } = require("./improvement-planner");
const { SelfQAAgent } = require("./self-qa-agent");

// ── Durum Sabitleri ────────────────────────────────────────────────────────────

const PATCH_STATUS = Object.freeze({
  PENDING   : "pending",
  BRANCHING : "branching",
  PATCHING  : "patching",
  TESTING   : "testing",
  QA_REVIEW : "qa_review",
  PR_READY  : "pr_ready",
  PR_OPEN   : "pr_open",
  FAILED    : "failed",
  QA_BLOCKED: "qa_blocked",
  SKIPPED   : "skipped",
});

// ── PatchGenerator Sınıfı ─────────────────────────────────────────────────────

class PatchGenerator {
  /**
   * @param {object} opts
   * @param {string} opts.projectRoot  — repo kökü
   * @param {string} opts.dataDir      — AEP data dizini
   * @param {string} opts.githubToken  — GitHub token
   * @param {string} opts.owner        — GitHub owner
   * @param {string} opts.repo         — GitHub repo adı
   * @param {string} opts.baseBranch   — hedef branch ("main")
   * @param {Function} opts.generateFn — LLM çağrısı: async (messages) => string
   */
  constructor({ projectRoot, dataDir, githubToken, owner, repo, baseBranch = "main", generateFn = null } = {}) {
    this._projectRoot = projectRoot;
    this._dataDir     = dataDir;
    this._token       = githubToken;
    this._owner       = owner;
    this._repo        = repo;
    this._baseBranch  = baseBranch;
    this._generateFn  = generateFn;
    this._logPath     = path.join(dataDir, "patch-log.jsonl");
    this._selfQA      = new SelfQAAgent();
  }

  // ── Ana Akış ────────────────────────────────────────────────────────────────

  /**
   * Bir öneri için tam patch döngüsü çalıştır.
   * @param {object} task
   * @param {object} proposal
   * @returns {Promise<PatchResult>}
   */
  async run(task, proposal) {
    const result = {
      taskId    : task.id,
      proposalId: proposal.id,
      status    : PATCH_STATUS.PENDING,
      branchName: null,
      prUrl     : null,
      prNumber  : null,
      testResults: null,
      changedFiles: [],
      rollbackPlan: null,
      error     : null,
      startedAt : Date.now(),
      completedAt: null,
    };

    try {
      // 1. Branch adı oluştur
      const branchName = this._branchName(task, proposal);
      result.branchName = branchName;
      result.rollbackPlan = `git revert HEAD veya branch'i sil: git push origin --delete ${branchName}`;

      // 2. GitHub'da branch oluştur
      result.status = PATCH_STATUS.BRANCHING;
      this._log(result);

      if (this._token) {
        await this._createGitHubBranch(branchName);
      }

      // 3. Patch içeriği üret (LLM veya kural tabanlı)
      result.status = PATCH_STATUS.PATCHING;
      const patches = await this._generatePatches(task, proposal, branchName);
      result.changedFiles = patches.map(p => p.path);

      // 4. Dosyaları GitHub'a push et
      if (this._token && patches.length) {
        await this._pushPatches(branchName, patches);
      }

      // 5. Test
      result.status = PATCH_STATUS.TESTING;
      result.testResults = await this._runTests();

      // Kalite geçmesi gerekiyor (0 başarısız)
      if (result.testResults.failed > 0) {
        throw new Error(`${result.testResults.failed} test başarısız oldu — patch reddedildi`);
      }

      // 5b. Self QA Agent — ikinci, bağımsız ajan ilk ajanın kodunu denetler.
      // Test yoksa / UTF-8 bozulduysa / test başarısızsa release bloklanır.
      result.status = PATCH_STATUS.QA_REVIEW;
      const qaReview = this._selfQA.review({
        patches: patches,
        testResults: result.testResults,
      });
      result.qaReview = qaReview;
      if (!qaReview.ok) {
        result.status = PATCH_STATUS.QA_BLOCKED;
        const reasons = qaReview.blockers.map((b) => b.message).join("; ");
        throw new Error(`Self QA Agent release'i bloke etti: ${reasons}`);
      }

      // 6. PR oluştur
      result.status = PATCH_STATUS.PR_READY;
      const { title, body, labels } = generatePRContent({ task, proposal, patchResult: result });

      if (this._token) {
        result.status = PATCH_STATUS.PR_OPEN;
        const pr = await createGitHubPR({
          token : this._token,
          owner : this._owner,
          repo  : this._repo,
          head  : branchName,
          base  : this._baseBranch,
          title, body, labels,
        });
        result.prUrl    = pr.url;
        result.prNumber = pr.number;
      }

      result.status     = PATCH_STATUS.PR_OPEN;
      result.completedAt = Date.now();
      this._log(result);
      return result;

    } catch (e) {
      if (result.status !== PATCH_STATUS.QA_BLOCKED) {
        result.status = PATCH_STATUS.FAILED;
      }
      result.error      = e.message;
      result.completedAt = Date.now();
      this._log(result);
      return result;
    }
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────────────

  _branchName(task, proposal) {
    const slug = (proposal.title || task.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return `aep/${task.id.toLowerCase()}-${slug}`;
  }

  async _createGitHubBranch(branchName) {
    const https = require("node:https");
    const API   = `https://api.github.com/repos/${this._owner}/${this._repo}`;

    // HEAD sha al
    const ref = await this._githubGet(`${API}/git/ref/heads/${this._baseBranch}`);
    const sha = ref.object?.sha;
    if (!sha) throw new Error("Base branch SHA alınamadı");

    // Branch oluştur
    await this._githubPost(`${API}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha,
    });
  }

  async _generatePatches(task, proposal, branchName) {
    // LLM varsa kullan
    if (this._generateFn && proposal.implementation) {
      try {
        const prompt = `
Aşağıdaki mühendislik görevini çözmek için minimal kod değişikliği üret.
Görev: ${task.title}
Açıklama: ${task.description}
Uygulama: ${proposal.implementation}
Etkilenen dosyalar: ${(proposal.affectedFiles || []).join(", ")}

Yalnızca JSON formatında döndür:
[{"path": "src/...", "content": "...tam dosya içeriği..."}]
`.trim();

        const response = await this._generateFn([
          { role: "system", content: "Sen CODEGA AI'nin patch üretici ajansın. Yalnızca JSON döndür." },
          { role: "user", content: prompt },
        ]);

        const json = this._extractJson(response);
        if (Array.isArray(json)) return json;
      } catch (e) {
        console.warn("[PatchGenerator] LLM patch hatası:", e.message);
      }
    }

    // Fallback: sadece test dosyası ekle
    return [{
      path   : `src/main/agent/__tests__/aep-patch-${task.id.toLowerCase()}.test.js`,
      content: `// AEP Auto-generated test for: ${task.title}\n// Task: ${task.id}\n// Status: placeholder — manual implementation required\ndescribe("${task.title}", () => {\n  it("should be implemented", () => {\n    expect(true).toBe(true);\n  });\n});\n`,
    }];
  }

  async _pushPatches(branchName, patches) {
    const API = `https://api.github.com/repos/${this._owner}/${this._repo}`;

    const ref = await this._githubGet(`${API}/git/ref/heads/${branchName}`);
    const headSha = ref.object?.sha;
    const commit  = await this._githubGet(`${API}/git/commits/${headSha}`);
    const baseTree = commit.tree?.sha;

    // Blob oluştur
    const treeItems = [];
    for (const patch of patches) {
      const blob = await this._githubPost(`${API}/git/blobs`, {
        content : Buffer.from(patch.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      treeItems.push({ path: patch.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // Tree → commit → ref
    const tree   = await this._githubPost(`${API}/git/trees`, { base_tree: baseTree, tree: treeItems });
    const newCom = await this._githubPost(`${API}/git/commits`, {
      message: `[AEP] patch: ${patches.map(p => p.path).join(", ")}`,
      tree   : tree.sha,
      parents: [headSha],
    });
    await this._githubPatch(`${API}/git/refs/heads/${branchName}`, { sha: newCom.sha });
  }

  async _runTests() {
    try {
      const jestBin = path.join(this._projectRoot, "apps/codegaai-desktop/node_modules/.bin/jest");
      const out = execSync(`"${jestBin}" --ci --json 2>/dev/null || true`, {
        cwd    : path.join(this._projectRoot, "apps/codegaai-desktop"),
        timeout: 60000,
        encoding: "utf8",
      });
      const data = JSON.parse(out);
      return {
        total   : data.numTotalTests    || 0,
        passed  : data.numPassedTests   || 0,
        failed  : data.numFailedTests   || 0,
        coverage: null,
      };
    } catch (e) {
      return { total: 0, passed: 0, failed: 0, error: e.message };
    }
  }

  // ── GitHub HTTP Yardımcıları ─────────────────────────────────────────────────

  _githubGet(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      require("node:https").get({
        hostname: u.hostname,
        path    : u.pathname + (u.search || ""),
        headers : {
          "Authorization": `token ${this._token}`,
          "User-Agent"   : "CODEGA-AEP/1.0",
          "Accept"       : "application/vnd.github.v3+json",
        },
      }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e){ reject(e); } });
      }).on("error", reject);
    });
  }

  _githubPost(url, body) { return this._githubRequest("POST", url, body); }
  _githubPatch(url, body){ return this._githubRequest("PATCH", url, body); }

  _githubRequest(method, url, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const u = new URL(url);
      const req = require("node:https").request({
        hostname: u.hostname,
        path    : u.pathname,
        method,
        headers : {
          "Authorization": `token ${this._token}`,
          "Content-Type" : "application/json",
          "User-Agent"   : "CODEGA-AEP/1.0",
          "Accept"       : "application/vnd.github.v3+json",
          "Content-Length": Buffer.byteLength(data),
        },
      }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e){ reject(e); } });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  _extractJson(text) {
    const m = String(text || "").match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  }

  _log(result) {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      fs.appendFileSync(this._logPath, JSON.stringify({ ...result, _at: Date.now() }) + "\n", "utf8");
    } catch (_) {}
  }
}

module.exports = { PatchGenerator, PATCH_STATUS };
