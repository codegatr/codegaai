"""
codegaai.core.action_delivery
=============================

Deterministic delivery layer for project/artifact requests.

Local models may still answer with advice when the user clearly asks for a
working ZIP/project. This module catches those requests before generation and
builds a usable starter artifact. The model can still help with bespoke code
later, but delivery must not depend on it choosing the right wording.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class DeliveryArtifact:
    kind: str
    project_name: str
    title: str
    files: dict[str, str]


_CREATE_WORDS = (
    "olustur", "hazirla", "hazirlayip", "tasarla", "tasarlayabilir",
    "yap", "kur", "uret", "ver", "teslim",
)
_DELIVERY_WORDS = (
    "zip", "dosya", "dosyalari", "proje", "web sitesi", "website",
    "site", "sistem", "uygulama",
)
_PROJECT_WORDS = (
    "php", "veritabani", "database", "mysql", "pdo", "kiralama",
    "rent", "arac", "araba", "filo", "rezervasyon", "online",
)
_FOLLOWUP_WORDS = (
    "simdi", "tamam", "evet", "basla", "tasarlayabilir misin",
    "olusturabilir misin", "hazirla", "ver", "yap",
)


def fold_tr(text: str) -> str:
    table = str.maketrans({
        "İ": "i", "I": "i", "ı": "i", "ğ": "g", "Ğ": "g",
        "ü": "u", "Ü": "u", "ş": "s", "Ş": "s",
        "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
    })
    return str(text or "").translate(table).casefold().replace("i̇", "i")


def _has_any(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def _recent_user_context(history: list[dict] | None, limit: int = 4) -> str:
    if not history:
        return ""
    users = [
        str(item.get("content", ""))
        for item in history[-limit:]
        if item.get("role") == "user"
    ]
    return "\n".join(users)


def should_deliver_project(message: str, history: list[dict] | None = None) -> bool:
    """Return True when the user expects a concrete generated artifact."""
    low = fold_tr(message)
    direct = (
        _has_any(low, _CREATE_WORDS)
        and _has_any(low, _DELIVERY_WORDS)
        and _has_any(low, _PROJECT_WORDS)
    )
    if direct:
        return True

    recent = fold_tr(_recent_user_context(history))
    followup = _has_any(low, _FOLLOWUP_WORDS) and _has_any(recent, _DELIVERY_WORDS)
    return bool(followup and _has_any(recent, _PROJECT_WORDS))


def infer_project_name(message: str, history: list[dict] | None = None) -> str:
    text = fold_tr(message + "\n" + _recent_user_context(history))
    if "kiralama" in text and ("arac" in text or "araba" in text or "rent" in text):
        return "arac_kiralama"
    if "php" in text:
        return "php_project"
    words = re.findall(r"[a-z0-9_]{3,}", text)
    name = "_".join(words[:3]) if words else "codega_project"
    return re.sub(r"[^a-z0-9_-]", "_", name)[:40] or "codega_project"


def build_delivery_artifact(message: str, history: list[dict] | None = None) -> DeliveryArtifact | None:
    if not should_deliver_project(message, history):
        return None
    project_name = infer_project_name(message, history)
    if project_name == "arac_kiralama":
        return _build_car_rental_project(project_name)
    return _build_php_starter_project(project_name, message)


def _build_car_rental_project(project_name: str) -> DeliveryArtifact:
    files = {
        "README.md": f"""# CODEGA Rent A Car

PHP 8.3+ ve MySQL/MariaDB ile calisan online arac kiralama baslangic sistemi.

## Kurulum
1. `schema.sql` dosyasini MySQL'e aktar.
2. `config.php` icindeki veritabani bilgilerini duzenle.
3. Projeyi PHP 8.3+ destekli hosting ya da local sunucuya yukle.
4. `public/index.php` dosyasini ac.

## Ozellikler
- Arac listeleme ve filtreleme
- Rezervasyon formu
- PDO prepared statements
- CSRF token korumasi
- Basit admin paneli
""",
        "config.php": """<?php
declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NAME = 'codega_rentacar';
const DB_USER = 'root';
const DB_PASS = '';

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
""",
        "schema.sql": """DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS vehicles;

CREATE TABLE vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  category VARCHAR(60) NOT NULL,
  transmission ENUM('manual','automatic') NOT NULL DEFAULT 'automatic',
  fuel VARCHAR(40) NOT NULL DEFAULT 'Benzin',
  daily_price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reservations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT UNSIGNED NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(40) NOT NULL,
  customer_email VARCHAR(160) NOT NULL,
  pickup_date DATE NOT NULL,
  return_date DATE NOT NULL,
  note TEXT NULL,
  status ENUM('pending','approved','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO vehicles (brand, model, category, transmission, fuel, daily_price, image_url) VALUES
('Renault', 'Clio', 'Ekonomik', 'automatic', 'Benzin', 1250.00, 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d'),
('Fiat', 'Egea', 'Orta Sinif', 'manual', 'Dizel', 1450.00, 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7'),
('Volkswagen', 'Passat', 'Konfor', 'automatic', 'Benzin', 2450.00, 'https://images.unsplash.com/photo-1503376780353-7e6692767b70');
""",
        "public/index.php": """<?php
declare(strict_types=1);

session_start();
require __DIR__ . '/../config.php';

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

$message = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'], $_POST['csrf'] ?? '')) {
        http_response_code(403);
        exit('Gecersiz istek.');
    }

    $vehicleId = (int)($_POST['vehicle_id'] ?? 0);
    $name = trim((string)($_POST['name'] ?? ''));
    $phone = trim((string)($_POST['phone'] ?? ''));
    $email = trim((string)($_POST['email'] ?? ''));
    $pickup = (string)($_POST['pickup_date'] ?? '');
    $return = (string)($_POST['return_date'] ?? '');
    $note = trim((string)($_POST['note'] ?? ''));

    if ($vehicleId > 0 && $name && $phone && filter_var($email, FILTER_VALIDATE_EMAIL) && $pickup && $return) {
        $stmt = db()->prepare(
            'INSERT INTO reservations
             (vehicle_id, customer_name, customer_phone, customer_email, pickup_date, return_date, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$vehicleId, $name, $phone, $email, $pickup, $return, $note]);
        $message = 'Talebiniz alindi. Ekibimiz kisa surede sizinle iletisime gececek.';
    } else {
        $message = 'Lutfen zorunlu alanlari kontrol edin.';
    }
}

$category = trim((string)($_GET['category'] ?? ''));
$sql = 'SELECT * FROM vehicles WHERE is_active = 1';
$params = [];
if ($category !== '') {
    $sql .= ' AND category = ?';
    $params[] = $category;
}
$sql .= ' ORDER BY daily_price ASC';
$stmt = db()->prepare($sql);
$stmt->execute($params);
$vehicles = $stmt->fetchAll();
$categories = db()->query('SELECT DISTINCT category FROM vehicles WHERE is_active = 1 ORDER BY category')->fetchAll();
?>
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CODEGA Rent A Car</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="hero">
    <nav>
      <strong>CODEGA Rent A Car</strong>
      <a href="#rezervasyon">Rezervasyon</a>
    </nav>
    <div>
      <p class="eyebrow">Konya ve cevresi icin online kiralama</p>
      <h1>Aracini sec, tarihleri gir, talebini hemen gonder.</h1>
      <p>Ekonomik, konfor ve kurumsal filo secenekleri tek ekranda.</p>
    </div>
  </header>

  <main>
    <?php if ($message): ?><div class="notice"><?= e($message) ?></div><?php endif; ?>

    <section class="toolbar">
      <a class="<?= $category === '' ? 'active' : '' ?>" href="?">Tum Araclar</a>
      <?php foreach ($categories as $row): ?>
        <a class="<?= $category === $row['category'] ? 'active' : '' ?>" href="?category=<?= urlencode($row['category']) ?>">
          <?= e($row['category']) ?>
        </a>
      <?php endforeach; ?>
    </section>

    <section class="fleet">
      <?php foreach ($vehicles as $vehicle): ?>
        <article class="vehicle">
          <img src="<?= e((string)$vehicle['image_url']) ?>" alt="<?= e($vehicle['brand'] . ' ' . $vehicle['model']) ?>">
          <div>
            <span><?= e($vehicle['category']) ?></span>
            <h2><?= e($vehicle['brand'] . ' ' . $vehicle['model']) ?></h2>
            <p><?= e($vehicle['transmission']) ?> vites · <?= e($vehicle['fuel']) ?></p>
            <strong><?= number_format((float)$vehicle['daily_price'], 0, ',', '.') ?> TL / gun</strong>
          </div>
        </article>
      <?php endforeach; ?>
    </section>

    <section id="rezervasyon" class="booking">
      <h2>Rezervasyon Talebi</h2>
      <form method="post">
        <input type="hidden" name="csrf" value="<?= e($_SESSION['csrf']) ?>">
        <label>Arac
          <select name="vehicle_id" required>
            <?php foreach ($vehicles as $vehicle): ?>
              <option value="<?= (int)$vehicle['id'] ?>"><?= e($vehicle['brand'] . ' ' . $vehicle['model']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>Ad Soyad <input name="name" required></label>
        <label>Telefon <input name="phone" required></label>
        <label>E-posta <input type="email" name="email" required></label>
        <label>Alis Tarihi <input type="date" name="pickup_date" required></label>
        <label>Donus Tarihi <input type="date" name="return_date" required></label>
        <label>Not <textarea name="note" rows="3"></textarea></label>
        <button type="submit">Talep Gonder</button>
      </form>
    </section>
  </main>
</body>
</html>
""",
        "public/assets/style.css": """*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,Arial,sans-serif;background:#0d1117;color:#f5f7fb}a{color:inherit;text-decoration:none}.hero{min-height:420px;padding:32px 8vw;background:linear-gradient(90deg,rgba(0,0,0,.84),rgba(0,0,0,.3)),url('https://images.unsplash.com/photo-1533473359331-0135ef1b58bf') center/cover}.hero nav{display:flex;justify-content:space-between;align-items:center}.hero h1{max-width:720px;font-size:clamp(40px,6vw,78px);line-height:1;margin:70px 0 16px}.hero p{max-width:620px;color:#cbd5e1}.eyebrow{color:#fbbf24!important;text-transform:uppercase;letter-spacing:.08em}.notice{margin:24px auto 0;max-width:1120px;padding:14px 18px;border:1px solid #10b981;background:rgba(16,185,129,.14);border-radius:8px}.toolbar{max-width:1120px;margin:28px auto;display:flex;gap:10px;flex-wrap:wrap}.toolbar a{padding:10px 14px;border:1px solid #263243;border-radius:8px;color:#cbd5e1}.toolbar a.active{background:#f59e0b;color:#111827;border-color:#f59e0b}.fleet{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}.vehicle{background:#151b23;border:1px solid #263243;border-radius:8px;overflow:hidden}.vehicle img{width:100%;height:190px;object-fit:cover}.vehicle div{padding:18px}.vehicle span{color:#fbbf24;font-size:13px}.vehicle h2{margin:8px 0}.vehicle p{color:#94a3b8}.vehicle strong{font-size:22px}.booking{max-width:1120px;margin:44px auto;padding:26px;background:#151b23;border:1px solid #263243;border-radius:8px}.booking form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.booking label{display:grid;gap:7px;color:#cbd5e1}.booking input,.booking select,.booking textarea{width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#0d1117;color:#fff}.booking textarea,.booking button{grid-column:1/-1}.booking button{padding:14px;border:0;border-radius:8px;background:#f59e0b;color:#111827;font-weight:800;cursor:pointer}@media(max-width:720px){.booking form{grid-template-columns:1fr}.hero{min-height:360px}.hero h1{margin-top:42px}}""",
    }
    return DeliveryArtifact(
        kind="php_project",
        project_name=project_name,
        title="PHP 8.3 online arac kiralama sistemi",
        files=files,
    )


def _build_php_starter_project(project_name: str, message: str) -> DeliveryArtifact:
    safe_title = "CODEGA PHP Starter"
    files = {
        "README.md": f"# {safe_title}\n\nTalep: {message.strip()}\n\nPHP 8.3+ starter proje.\n",
        "public/index.php": "<?php\ndeclare(strict_types=1);\n\necho '<h1>CODEGA PHP Starter</h1>';\n",
        "schema.sql": "CREATE TABLE app_items (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(160) NOT NULL);\n",
    }
    return DeliveryArtifact(
        kind="php_project",
        project_name=project_name,
        title="PHP 8.3 starter proje",
        files=files,
    )
