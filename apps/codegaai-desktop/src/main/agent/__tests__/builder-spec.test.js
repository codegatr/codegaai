"use strict";

const { parseProjectRequest, extractEntities, normalizeEntity, studly, pluralSnake, detectStack, detectDatabase } = require("../builder/builder-spec");

describe("builder-spec: yardımcılar", () => {
  test("studly / pluralSnake", () => {
    expect(studly("iş emri")).toBe("IsEmri");
    expect(pluralSnake("Customer")).toBe("customers");
    expect(pluralSnake("Category")).toBe("categories");
    expect(pluralSnake("WorkOrder")).toBe("work_orders");
  });

  test("detectStack / detectDatabase varsayılanları", () => {
    expect(detectStack("PHP 8.3 ile servis takip")).toBe("laravel");
    expect(detectStack("express api")).toBe("express");
    expect(detectDatabase("MySQL kullan")).toBe("mysql");
    expect(detectDatabase("postgres tabanlı")).toBe("postgresql");
  });
});

describe("builder-spec: entity çıkarımı", () => {
  test("Servis Takip prompt'undan domain entity'leri çıkar", () => {
    const ents = extractEntities("PHP 8.3 + MySQL ile müşteri, araç ve iş emri olan servis takip sistemi");
    const models = ents.map((e) => e.model).sort();
    expect(models).toContain("Customer");
    expect(models).toContain("Vehicle");
    expect(models).toContain("WorkOrder");
    // Vehicle customer_id foreignId taşımalı
    const v = ents.find((e) => e.model === "Vehicle");
    expect(v.fields.some((f) => f.name === "customer_id" && f.type === "foreignId")).toBe(true);
  });

  test("enjekte edilmiş entity listesi heuristiği atlar", () => {
    const ents = extractEntities("ignore", { entities: [{ model: "Ticket", fields: [{ name: "subject", type: "string" }] }] });
    expect(ents).toHaveLength(1);
    expect(ents[0].model).toBe("Ticket");
    expect(ents[0].table).toBe("tickets");
  });

  test("normalizeEntity: id atlanır, tip güvenli, tekrar temizlenir", () => {
    const e = normalizeEntity({ model: "Fatura", fields: [{ name: "id", type: "integer" }, { name: "Amount", type: "decimal" }, { name: "amount", type: "string" }, { name: "weird", type: "xxx" }] });
    expect(e.model).toBe("Fatura");
    expect(e.fields.find((f) => f.name === "id")).toBeUndefined();
    expect(e.fields.find((f) => f.name === "amount").type).toBe("decimal");
    expect(e.fields.find((f) => f.name === "weird").type).toBe("string");
  });
});

describe("builder-spec: parseProjectRequest (uçtan uca spec)", () => {
  test("tek prompt → tam spec (entities dahil)", () => {
    const spec = parseProjectRequest("Ateş Fiat için müşteri, araç, iş emri ve fatura içeren servis otomasyonu, REST API ve docker ile");
    expect(spec.type).toBe("laravel");
    expect(spec.database).toBe("mysql");
    expect(spec.features).toEqual(expect.arrayContaining(["auth", "api", "docker"]));
    expect(spec.entities.map((e) => e.model)).toEqual(expect.arrayContaining(["Customer", "Vehicle", "WorkOrder", "Invoice"]));
    expect(spec.name).toMatch(/otomasyon/i);
  });

  test("entity bulunamazsa boş liste (starter'a düşer)", () => {
    const spec = parseProjectRequest("basit bir merhaba dünya sayfası");
    expect(Array.isArray(spec.entities)).toBe(true);
    expect(spec.entities).toHaveLength(0);
  });
});
