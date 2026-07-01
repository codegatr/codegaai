"use strict";

const { normalizeEntity } = require("../builder/builder-spec");
const { laravelMigration, laravelModel, laravelController, apiRouteLines, entityFiles } = require("../builder/entity-php");
const { generateLaravel } = require("../builder/builder-engine");

const customer = normalizeEntity({
  model: "Customer",
  fields: [{ name: "name", type: "string" }, { name: "phone", type: "string", nullable: true }, { name: "balance", type: "decimal" }, { name: "customer_id", type: "foreignId" }, { name: "active", type: "boolean" }],
});

describe("entity-php: üreteçler", () => {
  test("migration gerçek Schema::create + kolonlar üretir", () => {
    const m = laravelMigration(customer);
    expect(m).toMatch(/Schema::create\('customers'/);
    expect(m).toMatch(/\$table->string\('name'\);/);
    expect(m).toMatch(/\$table->string\('phone'\)->nullable\(\);/);
    expect(m).toMatch(/\$table->decimal\('balance', 12, 2\)->default\(0\);/);
    expect(m).toMatch(/\$table->foreignId\('customer_id'\)->constrained\(\)->cascadeOnDelete\(\);/);
    expect(m).toMatch(/\$table->boolean\('active'\)->default\(false\);/);
    expect(m).toMatch(/dropIfExists\('customers'\)/);
  });

  test("model: doğru tablo + fillable", () => {
    const mod = laravelModel(customer);
    expect(mod).toMatch(/class Customer extends Model/);
    expect(mod).toMatch(/protected \$table = 'customers';/);
    expect(mod).toMatch(/'name', 'phone', 'balance', 'customer_id', 'active'/);
  });

  test("controller: 5 CRUD metodu + validation", () => {
    const withVar = { ...customer, varName: "customer" };
    const c = laravelController(withVar);
    for (const method of ["index", "store", "show", "update", "destroy"]) {
      expect(c).toMatch(new RegExp(`function ${method}\\b`));
    }
    expect(c).toMatch(/Customer::query\(\)->latest\(\)->paginate/);
    expect(c).toMatch(/'name' => 'required\|string'/);
    expect(c).toMatch(/'phone' => 'nullable\|string'/);
  });

  test("apiRouteLines: apiResource satırı", () => {
    const line = apiRouteLines([customer]);
    expect(line).toContain("Route::apiResource('customers', App\\Http\\Controllers\\CustomerController::class);");
  });

  test("entityFiles: migration+model+controller yolları", () => {
    const files = entityFiles(customer, 0);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("app/Models/Customer.php");
    expect(paths).toContain("app/Http/Controllers/CustomerController.php");
    expect(paths.some((p) => /database\/migrations\/.*create_customers_table\.php/.test(p))).toBe(true);
  });
});

describe("entity-php: generateLaravel entegrasyonu", () => {
  test("entities verilince domain dosyaları + rotalar eklenir", () => {
    const invoice = normalizeEntity({ model: "Invoice", fields: [{ name: "number", type: "string" }, { name: "amount", type: "decimal" }] });
    const files = generateLaravel({ name: "Servis Sistemi", features: ["auth", "api"], database: "mysql", entities: [customer, invoice] });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("app/Models/Customer.php");
    expect(paths).toContain("app/Models/Invoice.php");
    expect(paths).toContain("app/Http/Controllers/InvoiceController.php");
    const api = files.find((f) => f.path === "routes/api.php").content;
    expect(api).toMatch(/apiResource\('customers'/);
    expect(api).toMatch(/apiResource\('invoices'/);
  });

  test("entities boşsa eski starter davranışı (geriye uyumlu)", () => {
    const files = generateLaravel({ name: "Bos", features: ["auth"], database: "mysql", entities: [] });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("composer.json");
    // domain modeli YOK
    expect(paths.some((p) => p === "app/Models/Customer.php")).toBe(false);
  });
});
