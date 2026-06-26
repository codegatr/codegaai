"use strict";

const { createManifest } = require("./file-manifest");

function buildServiceAutomationProject(options = {}) {
  const projectName = options.projectName || "ates-fiat-servis";
  const files = [
    {
      path: "README.md",
      role: "docs",
      content: `# ${projectName}\n\nPHP 8.3 + MySQL tabanlı servis otomasyonu.\n\n## Modüller\n\n- Kullanıcı, rol ve yetki yönetimi\n- Müşteri yönetimi\n- Araç yönetimi\n- İş emri yönetimi\n- Stok ve parça takibi\n- Fatura ve tahsilat\n- NETGSM SMS bildirimi\n- Raporlama\n\n## Kurulum\n\n1. Veritabanını oluştur.\n2. \`database/schema.sql\` dosyasını içe aktar.\n3. \`config/database.php\` bilgilerini düzenle.\n4. Web kökünü \`public/\` klasörüne yönlendir.\n`,
    },
    {
      path: "database/schema.sql",
      role: "database",
      content: `CREATE TABLE users (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(120) NOT NULL,\n  email VARCHAR(180) NOT NULL UNIQUE,\n  password_hash VARCHAR(255) NOT NULL,\n  role VARCHAR(50) NOT NULL DEFAULT 'staff',\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE customers (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(180) NOT NULL,\n  phone VARCHAR(40),\n  email VARCHAR(180),\n  tax_no VARCHAR(40),\n  address TEXT,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE vehicles (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  customer_id INT NOT NULL,\n  plate VARCHAR(30) NOT NULL,\n  brand VARCHAR(80) DEFAULT 'Fiat',\n  model VARCHAR(120),\n  vin VARCHAR(80),\n  mileage INT DEFAULT 0,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (customer_id) REFERENCES customers(id)\n);\n\nCREATE TABLE work_orders (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  customer_id INT NOT NULL,\n  vehicle_id INT NOT NULL,\n  status VARCHAR(40) NOT NULL DEFAULT 'open',\n  complaint TEXT,\n  diagnosis TEXT,\n  total_amount DECIMAL(12,2) DEFAULT 0,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP NULL DEFAULT NULL,\n  FOREIGN KEY (customer_id) REFERENCES customers(id),\n  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)\n);\n`,
    },
    {
      path: "config/database.php",
      role: "config",
      content: `<?php\ndeclare(strict_types=1);\n\nreturn [\n    'dsn' => 'mysql:host=localhost;dbname=ates_fiat_servis;charset=utf8mb4',\n    'user' => 'root',\n    'password' => '',\n    'options' => [\n        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,\n        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,\n        PDO::ATTR_EMULATE_PREPARES => false,\n    ],\n];\n`,
    },
    {
      path: "public/index.php",
      role: "entry",
      content: `<?php\ndeclare(strict_types=1);\n\nsession_start();\n\nrequire_once __DIR__ . '/../app/Core/Database.php';\nrequire_once __DIR__ . '/../app/Core/Router.php';\n\n$router = new Router();\n$router->get('/', fn() => 'Ateş Fiat Servis Otomasyonu çalışıyor.');\n$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);\n`,
    },
    {
      path: "app/Core/Database.php",
      role: "core",
      content: `<?php\ndeclare(strict_types=1);\n\nfinal class Database\n{\n    private static ?PDO $pdo = null;\n\n    public static function connection(): PDO\n    {\n        if (self::$pdo instanceof PDO) {\n            return self::$pdo;\n        }\n\n        $config = require __DIR__ . '/../../config/database.php';\n        self::$pdo = new PDO($config['dsn'], $config['user'], $config['password'], $config['options']);\n        return self::$pdo;\n    }\n}\n`,
    },
    {
      path: "app/Core/Router.php",
      role: "core",
      content: `<?php\ndeclare(strict_types=1);\n\nfinal class Router\n{\n    private array $routes = [];\n\n    public function get(string $path, callable $handler): void\n    {\n        $this->routes['GET'][$path] = $handler;\n    }\n\n    public function dispatch(string $method, string $uri): void\n    {\n        $path = parse_url($uri, PHP_URL_PATH) ?: '/';\n        $handler = $this->routes[$method][$path] ?? null;\n\n        if (!$handler) {\n            http_response_code(404);\n            echo 'Sayfa bulunamadı';\n            return;\n        }\n\n        echo $handler();\n    }\n}\n`,
    },
    {
      path: "app/Modules/WorkOrders/WorkOrderController.php",
      role: "module",
      content: `<?php\ndeclare(strict_types=1);\n\nfinal class WorkOrderController\n{\n    public function create(array $data): int\n    {\n        $pdo = Database::connection();\n        $stmt = $pdo->prepare('INSERT INTO work_orders (customer_id, vehicle_id, complaint) VALUES (?, ?, ?)');\n        $stmt->execute([(int)$data['customer_id'], (int)$data['vehicle_id'], trim((string)$data['complaint'])]);\n        return (int)$pdo->lastInsertId();\n    }\n}\n`,
    },
  ];

  return createManifest({
    projectName,
    files,
    meta: {
      kind: "service_automation",
      stack: "PHP 8.3 + MySQL",
      exportReady: true,
    },
  });
}

module.exports = {
  buildServiceAutomationProject,
};
