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
const { guardPatchSet } = require("./path-guard");

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
      // 1. Branch adı oluştur (uzak branch YALNIZ doğrulama+QA geçince oluşturulur)
      const branchName = this._branchName(task, proposal);
      result.branchName = branchName;
      result.rollbackPlan = `git revert HEAD veya branch'i sil: git push origin --delete ${branchName}`;

      // 2. Patch içeriği üret (LLM veya kural tabanlı)
      result.status = PATCH_STATUS.PATCHING;
      this._log(result);
      const patches = await this._generatePatches(task, proposal, branchName);
      result.changedFiles = patches.map(p => p.path);

      // 3. YOL KORUMASI: LLM'in ürettiği patch'ler korumalı yollara (workflow, sır,
      // updater/preload iç dosyaları, ayar deposu) ya da depo dışına (traversal/mutlak)
      // DOKUNAMAZ. Bozuk yol ne yerelde uygulanır ne uzak dala gider.
      // CODEGA_RULES §Autonomous Development.
      const pathGuard = guardPatchSet(patches);
      if (!pathGuard.ok) {
        const reasons = pathGuard.blocked.map((b) => `${b.path} (${b.reason})`).join("; ");
        result.status = PATCH_STATUS.QA_BLOCKED;
        result.qaReview = {
          ok: false,
          blockers: pathGuard.blocked.map((b) => ({
            code: "protected-path",
            message: `Korumalı/geçersiz yol: ${b.path} (${b.reason})`,
            files: [b.path],
          })),
          warnings: [],
        };
        throw new Error(`Yol koruması engelledi (push edilmedi): ${reasons}`);
      }

      // 4. YEREL DOĞRULAMA (push ÖNCESİ) — DOĞRULANABİLİR SELF-PATCH:
      // Patch'i yerel çalışma ağacına UYGULA → check.mjs + jest koştur → ağacı ESKİ
      // HALİNE getir. Böylece testler patch'in GERÇEK halini sınar (eskiden testler
      // patch push edildikten sonra yamasız yerel ağaçta koşuyordu = anlamsızdı).
      // Yalnız YEŞİLSE devam; kırmızıysa push YOK. Otonom evrimin doğrulanabilirlik şartı.
      result.status = PATCH_STATUS.TESTING;
      const verification = await this._verifyPatchesLocally(patches);
      result.testResults = verification.testResults;
      result.verification = { checkOk: verification.checkOk, ok: verification.ok, error: verification.error || null };
      if (!verification.ok) {
        throw new Error(`Yerel doğrulama başarısız (push edilmedi): ${verification.error}`);
      }

      // 5. Self QA Agent — ikinci, bağımsız ajan ilk ajanın kodunu denetler.
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

      // 6. Uzak branch oluştur + push (YALNIZ doğrulama+QA geçtikten sonra)
      if (this._token) {
        result.status = PATCH_STATUS.BRANCHING;
        await this._createGitHubBranch(branchName);
        if (patches.length) await this._pushPatches(branchName, patches);
      }

      // 7. PR oluştur
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

  _appDir() {
    return path.join(this._projectRoot, "apps/codegaai-desktop");
  }

  /**
   * DOĞRULANABİLİR SELF-PATCH çekirdeği: patch setini YEREL çalışma ağacına uygular,
   * check.mjs + jest koşturur, sonra ağacı ESKİ HALİNE getirir (finally). Böylece
   * doğrulama patch'in gerçek halini sınar ve çalışma ağacı temiz kalır.
   *
   * Güvenlik: her yol appDir içine sınırlanır (yol koruması ilk savunma; bu ikinci).
   * Snapshot: var olan dosyanın içeriği saklanır, yoksa geri alımda silinir.
   * @returns {Promise<{ok:boolean, checkOk:boolean, testResults:object|null, error:string|null}>}
   */
  async _verifyPatchesLocally(patches) {
    const appDir = this._appDir();
    const snapshots = [];
    try {
      for (const p of Array.isArray(patches) ? patches : []) {
        const abs = path.resolve(appDir, String(p.path || ""));
        if (abs !== appDir && !abs.startsWith(appDir + path.sep)) {
          return { ok: false, checkOk: false, testResults: null, error: `yol appDir dışında: ${p.path}` };
        }
        const existed = fs.existsSync(abs);
        snapshots.push({ abs, existed, original: existed ? fs.readFileSync(abs, "utf8") : null });
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, String(p.content == null ? "" : p.content), "utf8");
      }

      const check = await this._runIntegrityCheck();
      if (!check.ok) {
        return { ok: false, checkOk: false, testResults: null, error: `check.mjs başarısız: ${check.error || ""}`.trim() };
      }

      const testResults = await this._runTests();
      if ((testResults.failed || 0) > 0) {
        return { ok: false, checkOk: true, testResults, error: `${testResults.failed} test başarısız` };
      }
      if ((testResults.total || 0) === 0 && testResults.error) {
        return { ok: false, checkOk: true, testResults, error: `test koşulamadı: ${testResults.error}` };
      }
      return { ok: true, checkOk: true, testResults, error: null };
    } finally {
      // GERİ AL: patch'lenen dosyaları eski haline döndür (çalışma ağacı kirletilmez).
      for (const s of snapshots.reverse()) {
        try {
          if (s.existed) fs.writeFileSync(s.abs, s.original, "utf8");
          else if (fs.existsSync(s.abs)) fs.unlinkSync(s.abs);
        } catch (_e) { /* geri alım en-iyi-çaba */ }
      }
    }
  }

  /** check.mjs bütünlük/sözdizim kapısını çalıştır (patch YEREL uygulanmışken). */
  async _runIntegrityCheck() {
    try {
      execSync(`node scripts/check.mjs`, {
        cwd: this._appDir(),
        timeout: 90000,
        encoding: "utf8",
        stdio: "pipe",
      });
      return { ok: true };
    } catch (e) {
      const detail = String((e && (e.stdout || "")) + (e && (e.stderr || "")) || (e && e.message) || "").slice(0, 400);
      return { ok: false, error: detail };
    }
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
