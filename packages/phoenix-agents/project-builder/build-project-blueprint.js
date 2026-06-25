"use strict";

function file(path, purpose, owner = "coder") {
  return { path, purpose, owner, status: "planned" };
}

function authenticationFiles() {
  return [
    file("database/users.sql", "Kullanıcı tablosu"),
    file("config/database.php", "PDO bağlantı ayarları"),
    file("app/Auth.php", "Kimlik doğrulama sınıfı"),
    file("app/Csrf.php", "CSRF token yönetimi"),
    file("public/register.php", "Kayıt ekranı"),
    file("public/login.php", "Giriş ekranı"),
    file("public/logout.php", "Çıkış işlemi"),
    file("public/dashboard.php", "Korumalı örnek panel"),
    file("README.md", "Kurulum ve kullanım notları", "project-builder"),
  ];
}

function serviceAutomationFiles() {
  return [
    file("database/schema.sql", "Ana veritabanı şeması"),
    file("config/app.php", "Uygulama ayarları"),
    file("config/database.php", "Veritabanı bağlantısı"),
    file("public/index.php", "Ön denetleyici"),
    file("app/Core/Router.php", "Basit yönlendirme"),
    file("app/Core/Controller.php", "Temel controller"),
    file("app/Modules/Auth/AuthController.php", "Giriş ve yetki yönetimi"),
    file("app/Modules/Customers/CustomerController.php", "Müşteri yönetimi"),
    file("app/Modules/Vehicles/VehicleController.php", "Araç yönetimi"),
    file("app/Modules/WorkOrders/WorkOrderController.php", "İş emri yönetimi"),
    file("app/Modules/Stock/StockController.php", "Parça stok yönetimi"),
    file("app/Modules/Invoices/InvoiceController.php", "Fatura yönetimi"),
    file("app/Modules/Reports/ReportController.php", "Raporlama"),
    file("README.md", "Kurulum ve sprint notları", "project-builder"),
  ];
}

function buildProjectBlueprint(task, plan) {
  const files = task.domain === "authentication" ? authenticationFiles()
    : task.domain === "service_automation" ? serviceAutomationFiles()
    : [file("README.md", "Proje planı", "project-builder")];

  return {
    taskId: task.id,
    projectName: task.title,
    language: task.language,
    database: task.database,
    domain: task.domain,
    modules: plan.modules || [],
    files,
    nextAction: "write_files",
  };
}

module.exports = {
  buildProjectBlueprint,
};
