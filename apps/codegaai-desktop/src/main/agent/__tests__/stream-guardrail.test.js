"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeGuardrailConfig,
  detectStreamGuardrailFailure,
  quarantineStreamFailure,
  buildGuardrailRetryInstruction,
} = require("../stream-guardrail");

afterEach(() => {
  if (process.env.CODEGA_STREAM_QUARANTINE_PATH) {
    try { fs.rmSync(process.env.CODEGA_STREAM_QUARANTINE_PATH, { force: true }); } catch (_e) {}
    delete process.env.CODEGA_STREAM_QUARANTINE_PATH;
  }
});

describe("stream-guardrail", () => {
  test("SQL/PHP structural failures carry deterministic reason and pattern ids", () => {
    expect(detectStreamGuardrailFailure("FROM customers_c ON JOIN(c.id=t.customer_id)").pattern).toBe("sql_on_join");
    expect(detectStreamGuardrailFailure("SELECT * FROM t JOIN(customer_id)").pattern).toBe("sql_parameterless_join");
    expect(detectStreamGuardrailFailure("WHERE c.").reason).toBe("dangling_alias");
    expect(detectStreamGuardrailFailure("<?php $pdo =").reason).toBe("php_syntax_salad");
    expect(detectStreamGuardrailFailure("function x(){\n // rest of code here\n}").reason).toBe("lazy_placeholder");
  });

  test("guardrail can be disabled through runtime settings without editing settings-store defaults", () => {
    const cfg = normalizeGuardrailConfig({ streamGuardrailEnabled: false, streamGuardrailMaxLocalRetries: 9 });
    expect(cfg.enabled).toBe(false);
    expect(cfg.maxLocalRetries).toBe(5);
    expect(detectStreamGuardrailFailure("FROM x ON JOIN(y)", cfg).bad).toBe(false);
  });

  test("quarantine writes redacted JSONL diagnostics and never throws", () => {
    const logPath = path.join(os.tmpdir(), `codega-guardrail-${Date.now()}-${Math.random()}.jsonl`);
    process.env.CODEGA_STREAM_QUARANTINE_PATH = logPath;
    const ok = quarantineStreamFailure({
      reason: "sql_syntax_salad",
      pattern: "sql_on_join",
      provider: "ollama",
      model: "qwen",
      attempt: 2,
      retryCount: 1,
      action: "local_retry",
      text: "api_key=SECRET123 FROM customers ON JOIN(x)",
    });
    expect(ok).toBe(true);
    const record = JSON.parse(fs.readFileSync(logPath, "utf8").trim());
    expect(record.reason).toBe("sql_syntax_salad");
    expect(record.pattern).toBe("sql_on_join");
    expect(record.attempt).toBe(2);
    expect(record.excerpt).toContain("api_key=***");
    expect(record.excerpt).not.toContain("SECRET123");
  });

  test("retry instruction preserves integral output and SQL guardrails", () => {
    const instruction = buildGuardrailRetryInstruction("sql_syntax_salad", 2);
    expect(instruction).toMatch(/complete artifact/);
    expect(instruction).toMatch(/ON JOIN/);
    expect(instruction).toMatch(/attempt 2/);
  });
});
