<?php
declare(strict_types=1);

/**
 * CODEGA AI Federation/Share — Kurulum Sihirbazı (install.php)
 * -----------------------------------------------------------
 * Bu dosyayı public/ (index.php ile aynı) klasöre koy ve tarayıcıda aç:
 *   https://ai.codega.com.tr/api/federation/install.php
 *
 * Adımlar: ortam kontrolü -> DB testi -> config.php yaz -> tabloları oluştur
 *          -> otomatik test -> uygulamada gireceğin değerler + Cloudflare uyarısı.
 *
 * GÜVENLİK: Kurulum bittikten sonra BU DOSYAYI SİL. Şifreyi gizli tut.
 */

const CFG_FILE  = __DIR__ . '/config.php';
const LOCK_FILE = __DIR__ . '/.codega-installed';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function detect_base_url(): string {
    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
              || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir    = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return $scheme . '://' . $host . ($dir === '' ? '' : $dir);
}

/** Tüm CREATE TABLE ifadeleri (schema.sql ile birebir; dosyaya bağımlı değil). */
function schema_sql(): string {
    return <<<SQL
CREATE TABLE IF NOT EXISTS federation_nodes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  node_hash CHAR(64) NOT NULL,
  node_label VARCHAR(16) NOT NULL,
  version VARCHAR(64) DEFAULT '',
  last_seen DATETIME NOT NULL,
  conversation_count INT UNSIGNED NOT NULL DEFAULT 0,
  feedback_positive INT UNSIGNED NOT NULL DEFAULT 0,
  feedback_negative INT UNSIGNED NOT NULL DEFAULT 0,
  feedback_total INT UNSIGNED NOT NULL DEFAULT 0,
  adapter_count INT UNSIGNED NOT NULL DEFAULT 0,
  topic_hashes_json JSON NULL,
  stats_json JSON NULL,
  ip_hash CHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_federation_nodes_hash (node_hash),
  KEY idx_federation_nodes_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS federation_knowledge (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id CHAR(64) NOT NULL,
  origin_hash VARCHAR(16) NOT NULL,
  topic_key CHAR(24) DEFAULT NULL,
  topic VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  quality DECIMAL(5,3) NOT NULL DEFAULT 0.000,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_federation_knowledge_item (item_id),
  KEY idx_federation_knowledge_topic (topic_key),
  KEY idx_federation_knowledge_created (created_at),
  KEY idx_federation_knowledge_origin (origin_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS federation_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(32) NOT NULL,
  node_label VARCHAR(16) DEFAULT NULL,
  message VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_federation_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shared_chats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  share_slug CHAR(12) NOT NULL,
  title VARCHAR(160) NOT NULL,
  messages_json JSON NOT NULL,
  message_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_ip_hash CHAR(64) DEFAULT NULL,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_viewed_at DATETIME DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shared_chats_slug (share_slug),
  KEY idx_shared_chats_created (created_at),
  KEY idx_shared_chats_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS federation_learning_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(48) NOT NULL,
  subject VARCHAR(160) DEFAULT NULL,
  score DECIMAL(5,3) DEFAULT NULL,
  detail_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_learning_audit_created (created_at),
  KEY idx_learning_audit_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL;
}

function config_template(array $v): string {
    $esc = static fn(string $s): string => str_replace("'", "\\'", $s);
    $lines = [
        "<?php",
        "declare(strict_types=1);",
        "",
        "return [",
        "    'db_dsn' => '" . $esc($v['db_dsn']) . "',",
        "    'db_user' => '" . $esc($v['db_user']) . "',",
        "    'db_pass' => '" . $esc($v['db_pass']) . "',",
        "    'admin_token' => '" . $esc($v['admin_token']) . "',",
        "    'allow_origin' => '" . $esc($v['allow_origin']) . "',",
        "    'public_base_url' => '" . $esc($v['public_base_url']) . "',",
        "    'share_token' => '" . $esc($v['share_token']) . "',",
        "    'auto_migrate' => true,",
        "    'active_peer_days' => 7,",
        "    'max_knowledge_items' => 50,",
        "    'rate_limit_window_seconds' => 300,",
        "    'rate_limit_stats_per_window' => 120,",
        "    'event_retention_days' => 30,",
        "    'share_retention_days' => 180,",
        "    'max_share_messages' => 200,",
        "    'max_share_text_chars' => 20000,",
        "];",
        "",
    ];
    return implode("\n", $lines);
}

$errors = [];
$done = false;
$result = [];
$behindCloudflare = isset($_SERVER['HTTP_CF_RAY']) || isset($_SERVER['HTTP_CF_CONNECTING_IP']);
$alreadyInstalled = is_file(CFG_FILE);

// Form gönderildi mi?
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $dbHost = trim((string)($_POST['db_host'] ?? 'localhost'));
    $dbName = trim((string)($_POST['db_name'] ?? ''));
    $dbUser = trim((string)($_POST['db_user'] ?? ''));
    $dbPass = (string)($_POST['db_pass'] ?? '');
    $adminToken = trim((string)($_POST['admin_token'] ?? ''));
    $shareToken = trim((string)($_POST['share_token'] ?? ''));
    $allowOrigin = trim((string)($_POST['allow_origin'] ?? '*')) ?: '*';
    $baseUrl = trim((string)($_POST['public_base_url'] ?? detect_base_url()));

    if ($dbName === '' || $dbUser === '') $errors[] = 'Veritabanı adı ve kullanıcı zorunlu.';
    if (strlen($adminToken) < 24) $errors[] = 'Admin token en az 24 karakter olmalı.';

    $dsn = "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";

    if (!$errors) {
        try {
            $db = new PDO($dsn, $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            // Tabloları oluştur
            foreach (array_filter(array_map('trim', explode(';', schema_sql()))) as $stmt) {
                $db->exec($stmt);
            }
            // config.php yaz
            $cfg = config_template([
                'db_dsn' => $dsn,
                'db_user' => $dbUser,
                'db_pass' => $dbPass,
                'admin_token' => $adminToken,
                'allow_origin' => $allowOrigin,
                'public_base_url' => $baseUrl,
                'share_token' => $shareToken,
            ]);
            if (@file_put_contents(CFG_FILE, $cfg) === false) {
                $errors[] = 'config.php yazılamadı. Klasör yazılabilir mi? (' . CFG_FILE . ')';
            } else {
                @file_put_contents(LOCK_FILE, date('c'));
                // Otomatik test: tablolar var mı?
                $tables = $db->query("SHOW TABLES LIKE 'federation_%'")->fetchAll(PDO::FETCH_COLUMN);
                $hasShare = (bool)$db->query("SHOW TABLES LIKE 'shared_chats'")->fetchColumn();
                $result = [
                    'tables' => count($tables) + ($hasShare ? 1 : 0),
                    'base' => $baseUrl,
                    'admin' => $baseUrl . '/status/?token=' . urlencode($adminToken),
                    'health' => $baseUrl . '/health',
                    'share' => $baseUrl . '/share',
                ];
                $done = true;
            }
        } catch (Throwable $e) {
            $errors[] = 'Veritabanı/şema hatası: ' . $e->getMessage();
        }
    }
}

$suggestToken = bin2hex(random_bytes(24)); // 48 hex
$suggestBase = detect_base_url();
$phpOk = PHP_VERSION_ID >= 80000;
$pdoOk = extension_loaded('pdo_mysql');
$writable = is_writable(__DIR__);
?>
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CODEGA AI — Kurulum Sihirbazı</title>
<style>
  :root { --bg:#0a0b0d; --card:#15171b; --line:#2a2d34; --text:#f2f3f5; --muted:#9aa0aa; --accent:#f59e0b; --ok:#22c55e; --err:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.55 ui-sans-serif,system-ui,"Segoe UI",sans-serif; }
  .wrap { max-width:720px; margin:40px auto; padding:0 18px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 24px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px 22px; margin-bottom:18px; }
  .row { display:flex; align-items:center; gap:10px; margin:8px 0; }
  .row .dot { width:10px; height:10px; border-radius:50%; flex:0 0 10px; }
  .ok { background:var(--ok); } .bad { background:var(--err); }
  label { display:block; font-weight:600; margin:14px 0 4px; }
  input { width:100%; padding:10px 12px; border-radius:9px; border:1px solid var(--line); background:#0e1014; color:var(--text); font:inherit; }
  .hint { color:var(--muted); font-size:12px; margin-top:3px; }
  button { margin-top:18px; background:var(--accent); color:#000; border:0; border-radius:999px; padding:12px 22px; font-weight:700; cursor:pointer; }
  .alert { border-radius:10px; padding:12px 14px; margin:10px 0; }
  .alert.err { background:rgba(239,68,68,.12); border:1px solid rgba(239,68,68,.4); }
  .alert.warn { background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.4); }
  .alert.ok { background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.4); }
  code { background:#0e1014; border:1px solid var(--line); border-radius:6px; padding:2px 6px; word-break:break-all; }
  a { color:var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <h1>CODEGA AI — Federation / Paylaşım Kurulum Sihirbazı</h1>
  <p class="sub">Veritabanını yapılandır, tabloları oluştur ve bağlantıyı test et.</p>

  <?php if ($behindCloudflare): ?>
    <div class="alert warn">
      <strong>Cloudflare algılandı.</strong> Bu site Cloudflare arkasında. Masaüstü uygulaması
      tarayıcı olmadığı için Cloudflare "challenge" sayfasına takılıp <code>403</code> alır.
      Aşağıdaki kurulum tamamlansa bile, uygulamadan erişim için Cloudflare'de
      <code>/api/federation/*</code> yoluna <em>"Skip / Security: Off"</em> WAF kuralı eklemelisin
      (ayrıntı en altta).
    </div>
  <?php endif; ?>

  <div class="card">
    <strong>1) Ortam Kontrolü</strong>
    <div class="row"><span class="dot <?= $phpOk?'ok':'bad' ?>"></span> PHP sürümü: <?= h(PHP_VERSION) ?> <?= $phpOk?'(uygun)':'(8.0+ gerekli)' ?></div>
    <div class="row"><span class="dot <?= $pdoOk?'ok':'bad' ?>"></span> pdo_mysql eklentisi: <?= $pdoOk?'var':'YOK' ?></div>
    <div class="row"><span class="dot <?= $writable?'ok':'bad' ?>"></span> Klasör yazılabilir (config.php için): <?= $writable?'evet':'HAYIR' ?></div>
  </div>

  <?php if ($done): ?>
    <div class="alert ok">
      <strong>Kurulum tamam ✓</strong> <?= (int)$result['tables'] ?> tablo hazır, config.php yazıldı.
    </div>
    <div class="card">
      <strong>2) Uygulamada / kontrol için kullan</strong>
      <p>Sağlık kontrolü: <code><?= h($result['health']) ?></code></p>
      <p>Paylaşım uç noktası: <code><?= h($result['share']) ?></code></p>
      <p>Yönetim paneli: <a href="<?= h($result['admin']) ?>" target="_blank"><?= h($result['admin']) ?></a></p>
      <p>Masaüstü uygulamasının beklediği temel URL: <code><?= h($result['base']) ?></code></p>
    </div>
    <div class="alert err">
      <strong>ŞİMDİ:</strong> Güvenlik için bu <code>install.php</code> dosyasını sunucudan <strong>SİL</strong>.
    </div>
  <?php else: ?>
    <?php foreach ($errors as $e): ?>
      <div class="alert err"><?= h($e) ?></div>
    <?php endforeach; ?>
    <?php if ($alreadyInstalled): ?>
      <div class="alert warn">config.php zaten var. Yeniden yapılandırırsan üzerine yazılır.</div>
    <?php endif; ?>

    <form method="post" class="card" autocomplete="off">
      <strong>2) Veritabanı</strong>
      <label>DB Host</label>
      <input name="db_host" value="<?= h($_POST['db_host'] ?? 'localhost') ?>">
      <label>DB Adı</label>
      <input name="db_name" value="<?= h($_POST['db_name'] ?? '') ?>" placeholder="codega_federation">
      <label>DB Kullanıcı</label>
      <input name="db_user" value="<?= h($_POST['db_user'] ?? '') ?>" placeholder="codega_user">
      <label>DB Şifre</label>
      <input name="db_pass" type="password" value="">

      <label>Admin Token (yönetim paneli için)</label>
      <input name="admin_token" value="<?= h($_POST['admin_token'] ?? $suggestToken) ?>">
      <div class="hint">Otomatik üretildi; saklamak istersen değiştirebilirsin (min 24 karakter).</div>

      <label>Paylaşım Token (opsiyonel)</label>
      <input name="share_token" value="<?= h($_POST['share_token'] ?? '') ?>">
      <div class="hint">Açık beta için boş bırak. Doluysa istemcinin de göndermesi gerekir.</div>

      <label>CORS allow_origin</label>
      <input name="allow_origin" value="<?= h($_POST['allow_origin'] ?? '*') ?>">

      <label>Genel Temel URL (public_base_url)</label>
      <input name="public_base_url" value="<?= h($_POST['public_base_url'] ?? $suggestBase) ?>">
      <div class="hint">Bu klasörün dışarıdan erişilen adresi. Tahmin: <?= h($suggestBase) ?></div>

      <button type="submit" <?= ($phpOk && $pdoOk && $writable) ? '' : 'disabled' ?>>Kur ve Test Et</button>
    </form>
  <?php endif; ?>

  <div class="card">
    <strong>Cloudflare not (önemli)</strong>
    <p class="hint" style="font-size:13px;line-height:1.6">
      ai.codega.com.tr Cloudflare arkasındaysa, uygulamadan gelen API isteği "challenge" ile
      <code>403</code> alır. Çözüm (birini seç):<br>
      1) Cloudflare → Security → WAF → Custom Rules: <code>URI Path starts with /api/federation</code>
      için action <em>Skip</em> (Managed/Bot challenge'ları atla). İstersen header eşleşmesi ekle:
      <code>X-Codega-Client equals codega-desktop</code>.<br>
      2) Cloudflare → Security → Bots → "Bot Fight Mode"'u kapat (en azından bu yol için).<br>
      3) Ya da API için Cloudflare proxy'sini kapat (DNS kaydını "DNS only / gri bulut" yap).
    </p>
  </div>
</div>
</body>
</html>
