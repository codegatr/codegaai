"use strict";

const finalAnswerSanitizer = require("../final-answer-sanitizer");
const { ContextEngine } = require("../context/context-engine");
const { preview } = require("../builder/builder-engine");
const { SelfQAAgent, BLOCKER } = require("../aep/self-qa-agent");
const { prioritizeStrongModelForHeavyPrompt } = require("../../model-manager");

const TWELVE_HEADED_PROMPT = [
  "[Mantik] Bir odada 3 kedi vardir. Her kedinin onunde 2, arkasinda 2 kedi nasil mumkundur?",
  "[Dikkat] 20 inegin 6'si haric hepsi oldu. Kac canli inek kalir?",
  "[Muhakeme] Nilufeler 40. gunde doluyorsa 3/4 zamani nedir?",
  "[Matematik] Saat 03:15 iken dar aci nedir?",
  "[Mimari] npm workspaces hoisting politikasi nasil set edilir?",
  "[Otomasyon] PowerShell fail-fast nasil kurgulanir?",
  "[Performans] MessageChannel ve requestAnimationFrame kuyrugu nasil kurulur?",
  "[Guvenlik] fs.rename tabanli atomik yazma nasil kodlanir?",
  "[Veri Butunlugu] manifest.json ve inc/version.php rollback dongusu nasil kurulur?",
  "[Eszamanlilik] Yerel async Mutex ile race condition nasil cozulur?",
  "[Tedarik Zinciri] package.json overrides politikasi nasil olmalidir?",
  "[Surum Dogrulama] TOPLAM_MODUL_SAYISI regex kontrolu pipeline'a nasil eklenir?",
].join("\n\n");

function twelvePartAnswer() {
  return [
    "[Mantik] Cevap 1: Dairesel dizilim.",
    "[Dikkat] Cevap 2: 6 canli inek kalir.",
    "[Muhakeme] Cevap 3: 39. gun ile 40. gun arasinda, 40. gune yakin.",
    "[Matematik] Cevap 4: 7.5 derece.",
    "[Mimari] Cevap 5: Hoisting root policy ile kilitlenir.",
    "[Otomasyon] Cevap 6: Komuttan sonra exit code kontrol edilip throw edilir.",
    "[Performans] Cevap 7: Main thread'e batch kuyruk ve rAF flush uygulanir.",
    "[Guvenlik] Cevap 8: Temp dosya yazilir, fsync sonrasi rename edilir.",
    "[Veri Butunlugu] Cevap 9: Once yedek, sonra staged write, hatada restore.",
    "[Eszamanlilik] Cevap 10: Promise tabanli mutex siraya alir.",
    "[Tedarik Zinciri] Cevap 11: overrides allowlist ve pin policy ile tutulur.",
    "[Surum Dogrulama] Cevap 12: Regex fail-fast gate release oncesi kosar.",
    "Final Answer: 0.75",
  ].join("\n");
}

function hugeLaravelPrompt() {
  const lines = Array.from({ length: 1000 }, (_, i) =>
    `Module ${i + 1}: Laravel controller, migration, route, request validation, policy, feature test, README section.`
  );
  return [
    "PHP/Laravel icin 1000+ satirlik production proje uret.",
    "Migration, controller, route, policy, tests ve README eksiksiz olsun.",
    ...lines,
  ].join("\n");
}

describe("CODEGA AI Nirvana engineering regression gate", () => {
  test("[sanitizer] 12 headed technical answers do not collapse to one Final Answer", () => {
    const result = finalAnswerSanitizer.cleanUserFacingOutput(
      twelvePartAnswer(),
      TWELVE_HEADED_PROMPT,
      null,
    );

    for (let i = 1; i <= 12; i += 1) {
      expect(result.answer).toContain(`Cevap ${i}`);
    }
    expect(result.answer.trim()).not.toBe("0.75");
    expect(result.answer).toContain("[Surum Dogrulama]");
  });

  test("[model-router] 1000+ line Laravel request prioritizes strongest installed model", () => {
    const installed = ["qwen3.5:4b", "qwen2.5-coder:3b", "qwen3.5:9b"];
    const routed = prioritizeStrongModelForHeavyPrompt(
      hugeLaravelPrompt(),
      installed,
      ["qwen3.5:4b", "qwen2.5-coder:3b"],
      {},
    );

    expect(routed.escalated).toBe(true);
    expect(routed.attemptModels[0]).toBe("qwen3.5:9b");
  });

  test("[context] short follow-ups resolve against previous ACE context", () => {
    const engine = new ContextEngine();
    engine.push("user", "Ates Fiat icin Laravel servis takip modulu uret.");
    engine.push("assistant", "Dosya manifestosu, migrations, controller, routes ve README hazirlayacagim.");

    for (const message of ["devam et", "bunu duzelt", "Ates Fiat", "Konya"]) {
      const packet = engine.analyze(message);
      expect(packet.isContinuation).toBe(true);
      expect(packet.type).not.toBe("new_topic");
      expect(`${packet.resolvedMessage}\n${packet.compressedContext}`).toMatch(/Ates Fiat|Laravel|servis|Konya/i);
    }
  });

  test("[builder] project builder returns real manifest, files, routes, migrations, README and tests", () => {
    const manifest = preview({
      type: "laravel",
      name: "Ates Fiat Service",
      features: ["auth", "docker", "ci", "tests", "api"],
      database: "mysql",
      description: "Service tracking platform",
    });

    expect(manifest.fileCount).toBeGreaterThan(10);
    expect(manifest.files).toContain("routes/api.php");
    expect(manifest.files).toContain("README.md");
    expect(manifest.files).toContain("app/Http/Controllers/Auth/AuthController.php");
    expect(manifest.files.some((file) => file.startsWith("database/migrations/"))).toBe(true);
    expect(manifest.files.some((file) => file.startsWith("tests/Feature/"))).toBe(true);
    expect(manifest.files).toContain(".github/workflows/ci.yml");
  });

  test("[QA] Self QA blocks UTF-8 corruption and placeholder-only test patches before PR", () => {
    const qa = new SelfQAAgent();
    const result = qa.review({
      patches: [
        { path: "src/main/agent/foo.js", content: "module.exports = 'bad\uFFFDtext';" },
        {
          path: "src/main/agent/__tests__/foo.test.js",
          content: "// Status: placeholder - manual implementation required",
        },
      ],
      testResults: { total: 1, passed: 1, failed: 0 },
    });

    expect(result.ok).toBe(false);
    expect(result.blockers.some((b) => b.code === BLOCKER.UTF8_CORRUPTION)).toBe(true);
    expect(result.blockers.some((b) => b.code === BLOCKER.PLACEHOLDER_TESTS)).toBe(true);
  });
});
