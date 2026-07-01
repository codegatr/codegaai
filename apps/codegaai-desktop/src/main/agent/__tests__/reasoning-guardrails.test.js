"use strict";

const { REASONING_GUARDRAILS } = require("../reasoning-guardrails");
const { buildSystemPrompt } = require("../system-prompt");

describe("reasoning-guardrails: muhakeme/dikkat/mantık katmanı", () => {
  test("dört kuralı da içerir (dikkat/üssel/syntax/sade)", () => {
    expect(REASONING_GUARDRAILS).toMatch(/kazazede|GÖMÜLMEZ|hariç/i);
    expect(REASONING_GUARDRAILS).toMatch(/nilüfer|2 katına|log2|üssel/i);
    expect(REASONING_GUARDRAILS).toMatch(/SÖZDİZİMİ|runnable|then/i);
    expect(REASONING_GUARDRAILS).toMatch(/ANTI-LOOP|TEKRARLAMA|BİR KEZ/i);
  });

  test("derin sistem prompt'una gömülür (system-wide)", () => {
    const sp = buildSystemPrompt("chat");
    expect(sp).toContain("MANTIK VE DİKKAT KATMANI");
  });
});
