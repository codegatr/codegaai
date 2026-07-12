"use strict";

const { diagnoseStructuralDefects, buildSelfRepairInstruction } = require("../stream-guardrail");
const { ModelManager } = require("../../model-manager");

describe("öz-yansıma teşhisi (diagnoseStructuralDefects)", () => {
  test("ON JOIN + yarım alias somut kusur olarak teşhis edilir (suçlu satırla)", () => {
    const broken = "SELECT c.name FROM customers c ON JOIN orders o\nWHERE c.\n";
    const defects = diagnoseStructuralDefects(broken);
    const ids = defects.map((d) => d.id);
    expect(ids).toContain("sql_on_join");
    expect(defects.find((d) => d.id === "sql_on_join").evidence).toMatch(/ON JOIN/i);
    expect(defects.some((d) => /alias/i.test(d.id))).toBe(true);
  });

  test("temiz SQL kusursuz", () => {
    const clean = "SELECT c.name FROM customers c JOIN orders o ON o.customer_id = c.id;";
    expect(diagnoseStructuralDefects(clean)).toHaveLength(0);
  });

  test("onarım talimatı kusurları ve düzeltme mantığını içerir", () => {
    const t = buildSelfRepairInstruction("sql_syntax_salad", 1, diagnoseStructuralDefects("x ON JOIN y"));
    expect(t).toMatch(/ÖZ-YANSIMA ONARIMI/);
    expect(t).toMatch(/ON JOIN/);
    expect(t).toMatch(/MANTIK hatasını/);
    expect(t).toMatch(/JOIN tablo alias ON koşul/);
  });
});

describe("askDirect öz-yansıma onarım akışı", () => {
  test("bozuk SQL → onarım turunda teşhis gösterilir, düzeltilmiş kod teslim edilir", async () => {
    const mgr = new ModelManager();
    mgr.installedModels = async () => ["qwen2.5:4b"];
    const brokenSql = "CREATE TABLE musteriler (id INT);\nSELECT c.name FROM customers c ON JOIN orders o WHERE c.";
    const fixedSql = "SELECT c.name FROM customers c JOIN orders o ON o.customer_id = c.id;";
    let calls = 0;
    let repairSystemSeen = "";
    mgr.generate = async (_m, messages) => {
      calls += 1;
      if (calls === 1) return brokenSql;
      repairSystemSeen = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
      return fixedSql;
    };
    const res = await mgr.askDirect("müşteri-sipariş JOIN sorgusu yaz", { chatId: "srp1" });
    expect(calls).toBe(2);
    expect(res.text).toBe(fixedSql);
    expect(res.source).toBe("direct_selfcorrected");
    // Onarım turu jenerik retry DEĞİL — öz-yansıma teşhisi içerir.
    expect(repairSystemSeen).toMatch(/ÖZ-YANSIMA ONARIMI/);
    expect(repairSystemSeen).toMatch(/ON JOIN/);
  });
});
