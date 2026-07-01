"use strict";

/**
 * builder-spec.js — Prompt → Proje Spec (domain entities dahil).
 *
 * Builder'ın en kritik eksik halkası: bir isteği DOMAIN ENTITY'lere çevirmek.
 * Bu modül SAF ve deterministik (v1: anahtar-kelime + Türkçe/İngilizce sözlük).
 * LLM ile üretilmiş entity listesi de KABUL EDİLİR (opts.entities) — seam hazır.
 *
 * Çıktı Builder spec'ine `entities` ekler; entity yoksa Builder eski starter
 * davranışına düşer (geriye uyumlu).
 */

// StudlyCase (tekil) — model adı.
function studly(s) {
  return String(s || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase sınırını koru (WorkOrder→Work Order)
    .toLowerCase()
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// snake_case (çoğul) — tablo adı (basit İngilizce çoğullaştırma).
function pluralSnake(studlyName) {
  const s = String(studlyName || "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  if (!s) return "records";
  if (/(s|x|z|ch|sh)$/.test(s)) return s + "es";
  if (/[^aeiou]y$/.test(s)) return s.replace(/y$/, "ies");
  return s + "s";
}

// Yaygın iş-domain sözlüğü: TR/EN anahtar → { model, fields }.
// fields: {name,type,nullable?} — type: string|text|integer|decimal|boolean|date|datetime
const DOMAIN_DICT = [
  { keys: ["müşteri", "musteri", "customer", "cari"], model: "Customer",
    fields: [{ name: "name", type: "string" }, { name: "phone", type: "string", nullable: true }, { name: "email", type: "string", nullable: true }, { name: "tax_no", type: "string", nullable: true }, { name: "address", type: "text", nullable: true }] },
  { keys: ["araç", "arac", "vehicle", "araba"], model: "Vehicle",
    fields: [{ name: "customer_id", type: "foreignId" }, { name: "plate", type: "string" }, { name: "brand", type: "string", nullable: true }, { name: "model", type: "string", nullable: true }, { name: "mileage", type: "integer", nullable: true }] },
  { keys: ["iş emri", "is emri", "work order", "workorder", "servis kaydı", "servis kaydi"], model: "WorkOrder",
    fields: [{ name: "customer_id", type: "foreignId" }, { name: "vehicle_id", type: "foreignId", nullable: true }, { name: "status", type: "string" }, { name: "complaint", type: "text", nullable: true }, { name: "total_amount", type: "decimal" }] },
  { keys: ["ürün", "urun", "product", "mamul"], model: "Product",
    fields: [{ name: "name", type: "string" }, { name: "sku", type: "string", nullable: true }, { name: "price", type: "decimal" }, { name: "stock", type: "integer" }] },
  { keys: ["stok", "parça", "parca", "part", "inventory"], model: "Part",
    fields: [{ name: "name", type: "string" }, { name: "code", type: "string", nullable: true }, { name: "quantity", type: "integer" }, { name: "unit_price", type: "decimal" }] },
  { keys: ["fatura", "invoice", "tahsilat", "payment"], model: "Invoice",
    fields: [{ name: "customer_id", type: "foreignId" }, { name: "number", type: "string" }, { name: "amount", type: "decimal" }, { name: "paid", type: "boolean" }, { name: "issued_at", type: "datetime", nullable: true }] },
  { keys: ["sipariş", "siparis", "order"], model: "Order",
    fields: [{ name: "customer_id", type: "foreignId" }, { name: "status", type: "string" }, { name: "total", type: "decimal" }] },
  { keys: ["randevu", "appointment", "rezervasyon"], model: "Appointment",
    fields: [{ name: "customer_id", type: "foreignId" }, { name: "scheduled_at", type: "datetime" }, { name: "note", type: "text", nullable: true }] },
  { keys: ["rol", "role", "yetki", "permission"], model: "Role",
    fields: [{ name: "name", type: "string" }, { name: "slug", type: "string" }] },
  { keys: ["kategori", "category"], model: "Category",
    fields: [{ name: "name", type: "string" }, { name: "slug", type: "string", nullable: true }] },
  { keys: ["personel", "çalışan", "calisan", "employee", "teknisyen", "technician"], model: "Employee",
    fields: [{ name: "name", type: "string" }, { name: "role", type: "string", nullable: true }, { name: "phone", type: "string", nullable: true }] },
];

function normalizeEntity(input = {}) {
  const model = studly(input.model || input.name);
  if (!model) return null;
  const table = input.table || pluralSnake(model);
  const rawFields = Array.isArray(input.fields) && input.fields.length
    ? input.fields
    : [{ name: "name", type: "string" }];
  const seen = new Set();
  const fields = [];
  for (const f of rawFields) {
    const name = String(f && f.name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!name || seen.has(name) || name === "id") continue;
    seen.add(name);
    fields.push({
      name,
      type: ["string", "text", "integer", "decimal", "boolean", "date", "datetime", "foreignId"].includes(f.type) ? f.type : "string",
      nullable: !!f.nullable,
    });
  }
  return { model, table, fields, relations: Array.isArray(input.relations) ? input.relations : [] };
}

const fold = (s) => String(s || "").toLowerCase()
  .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
  .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u");

// Prompt'tan domain entity'lerini çıkar (v1 heuristik). LLM entity'leri
// opts.entities ile enjekte edilebilir (o zaman heuristik atlanır).
function extractEntities(prompt, opts = {}) {
  if (Array.isArray(opts.entities) && opts.entities.length) {
    return opts.entities.map(normalizeEntity).filter(Boolean);
  }
  const text = " " + fold(prompt) + " ";
  const picked = new Map();
  for (const d of DOMAIN_DICT) {
    if (d.keys.some((k) => text.includes(fold(k)))) {
      if (!picked.has(d.model)) picked.set(d.model, normalizeEntity({ model: d.model, fields: d.fields }));
    }
  }
  return [...picked.values()];
}

function detectStack(prompt) {
  const t = fold(prompt);
  if (/\b(laravel|php)\b/.test(t)) return "laravel";
  if (/\b(express|node)\b/.test(t)) return "express";
  if (/\bnext\.?js\b/.test(t)) return "nextjs";
  if (/\breact\b/.test(t)) return "react";
  if (/\bvue\b/.test(t)) return "vue";
  if (/\bflutter\b/.test(t)) return "flutter";
  return "laravel"; // ticari PHP projesi varsayılanı
}

function detectDatabase(prompt) {
  const t = fold(prompt);
  if (/\bpostgres|postgresql\b/.test(t)) return "postgresql";
  if (/\bsqlite\b/.test(t)) return "sqlite";
  return "mysql";
}

function extractName(prompt) {
  const m = String(prompt || "").match(/["“]([^"”]{2,60})["”]/);
  if (m) return m[1].trim();
  const m2 = String(prompt || "").match(/([\wçğıöşüÇĞİÖŞÜ ]{3,50}?)\s+(sistemi|otomasyonu|uygulaması|paneli|projesi)/i);
  if (m2) return (m2[1] + " " + m2[2]).trim();
  return "codega-project";
}

/**
 * Prompt → tam Builder spec (entities dahil).
 * @param {string} prompt
 * @param {object} [opts] { entities?, name?, stack?, database?, features? }
 */
function parseProjectRequest(prompt, opts = {}) {
  const t = fold(prompt);
  const features = new Set(opts.features || []);
  features.add("auth"); // ticari projede varsayılan
  if (/\bdocker\b/.test(t)) features.add("docker");
  if (/\btest|phpunit\b/.test(t)) features.add("tests");
  if (/\bapi|rest\b/.test(t)) features.add("api");
  if (/\bci|github actions\b/.test(t)) features.add("ci");

  return {
    name: opts.name || extractName(prompt),
    type: opts.stack || detectStack(prompt),
    database: opts.database || detectDatabase(prompt),
    features: [...features],
    entities: extractEntities(prompt, opts),
    description: String(prompt || "").slice(0, 500),
  };
}

module.exports = {
  parseProjectRequest, extractEntities, normalizeEntity,
  studly, pluralSnake, detectStack, detectDatabase, DOMAIN_DICT,
};
