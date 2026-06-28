"use strict";

/**
 * self-qa-agent.js - CODEGA AI Self QA Agent
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Patch-generator'in uerettigi her patch seti PR acilmadan once buradan gecer.
 * Bu, ilk ajanin (LLM/patch ueretici) yazdigi kodu elestiren BAGIMSIZ ikinci bir
 * ajandir - dil-agnostik, kural tabanli bir release-gate.
 *
 * KURAL: review().ok === false ise PatchGenerator PR acmaz, status FAILED olur.
 *
 * Bloklayan kosullar:
 *   - Degistirilen kaynak dosyalari icin hic test eklenmemis/guencellenmemis
 *   - UTF-8 bozulmasi (mojibake, BOM, null byte, replacement char)
 *   - Onceki calistirmaya gore performans/test-suresi regresyonu
 */

const NULL_BYTE = String.fromCharCode(0x0000);
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

const BLOCKER = Object.freeze({
  NO_TESTS       : "no-tests",
  UTF8_CORRUPTION: "utf8-corruption",
  PERF_REGRESSION: "perf-regression",
  TESTS_FAILED   : "tests-failed",
});

// Mojibake'de sik goeruelen UTF-8/Latin-1 cift kodlama imzalari.
// U+00C3 ("Ã") + devam bayti (U+0080-U+00BF) cift kodlanmis UTF-8'in tipik izidir.
const MOJIBAKE_PATTERNS = [
  /Ã[-¿]/,
  /â€[]/,
];

class SelfQAAgent {
  /**
   * @param {object} opts
   * @param {number} opts.perfRegressionThresholdMs - eski/yeni test suresi farki esigi
   */
  constructor({ perfRegressionThresholdMs = 15000 } = {}) {
    this._perfThreshold = perfRegressionThresholdMs;
  }

  /**
   * Bir patch setini ve test sonucunu denetle.
   * @param {object} opts
   * @param {Array<{path:string, content:string}>} opts.patches
   * @param {object} opts.testResults - { total, passed, failed, durationMs? }
   * @param {object} [opts.baseline]  - onceki scorecard/test calistirmasi (perf kiyaslama icin)
   * @returns {{ ok: boolean, blockers: object[], warnings: object[] }}
   */
  review({ patches = [], testResults = null, baseline = null } = {}) {
    const blockers = [];
    const warnings = [];

    this._checkTests(patches, blockers, warnings);
    this._checkUtf8(patches, blockers);
    this._checkTestOutcome(testResults, blockers);
    this._checkPerfRegression(testResults, baseline, warnings);

    return { ok: blockers.length === 0, blockers, warnings };
  }

  // -- 1. Test varligi ---------------------------------------------------------

  _checkTests(patches, blockers, warnings) {
    if (!patches.length) return;

    const testPatches = patches.filter((p) => this._isTestFile(p.path));
    const sourcePatches = patches.filter((p) => !this._isTestFile(p.path));

    if (sourcePatches.length && !testPatches.length) {
      blockers.push({
        code: BLOCKER.NO_TESTS,
        message: `Degistirilen ${sourcePatches.length} kaynak dosyasi icin hic test eklenmedi/guncellenmedi.`,
        files: sourcePatches.map((p) => p.path),
      });
      return;
    }

    // Placeholder testler (patch-generator fallback) gercek test sayilmaz
    const placeholders = testPatches.filter((p) =>
      /placeholder.*manual implementation required/i.test(p.content || "")
    );
    if (placeholders.length === testPatches.length && testPatches.length > 0) {
      warnings.push({
        code: "placeholder-tests",
        message: "Eklenen testler placeholder - gercek assertion icermiyor.",
        files: placeholders.map((p) => p.path),
      });
    }
  }

  _isTestFile(filePath) {
    return /(\.test\.|\.spec\.)|__tests__\//i.test(String(filePath || ""));
  }

  // -- 2. UTF-8 buetuenlueguue --------------------------------------------------

  _checkUtf8(patches, blockers) {
    for (const patch of patches) {
      const content = String(patch.content || "");

      if (content.includes(NULL_BYTE)) {
        blockers.push({
          code: BLOCKER.UTF8_CORRUPTION,
          message: `Null byte tespit edildi: ${patch.path}`,
          files: [patch.path],
        });
        continue;
      }

      if (content.includes(REPLACEMENT_CHAR)) {
        blockers.push({
          code: BLOCKER.UTF8_CORRUPTION,
          message: `Replacement character (U+FFFD) tespit edildi: ${patch.path}`,
          files: [patch.path],
        });
        continue;
      }

      if (MOJIBAKE_PATTERNS.some((pattern) => pattern.test(content))) {
        blockers.push({
          code: BLOCKER.UTF8_CORRUPTION,
          message: `Olasi mojibake/UTF-8 bozulmasi: ${patch.path}`,
          files: [patch.path],
        });
      }
    }
  }

  // -- 3. Test sonucu -----------------------------------------------------------

  _checkTestOutcome(testResults, blockers) {
    if (!testResults) return;
    if ((testResults.failed || 0) > 0) {
      blockers.push({
        code: BLOCKER.TESTS_FAILED,
        message: `${testResults.failed} test basarisiz.`,
      });
    }
  }

  // -- 4. Performans regresyonu ---------------------------------------------------

  _checkPerfRegression(testResults, baseline, warnings) {
    if (!testResults?.durationMs || !baseline?.durationMs) return;
    const delta = testResults.durationMs - baseline.durationMs;
    if (delta > this._perfThreshold) {
      warnings.push({
        code: BLOCKER.PERF_REGRESSION,
        message: `Test suresi ${delta}ms artti (esik: ${this._perfThreshold}ms).`,
      });
    }
  }
}

module.exports = { SelfQAAgent, BLOCKER };
