<?php
declare(strict_types=1);

$configPath = dirname(__DIR__) . '/config.php';
if (!is_file($configPath)) {
    $configPath = dirname(__DIR__) . '/config.sample.php';
}
$config = require $configPath;

header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: ' . ($config['allow_origin'] ?? '*'));
header('Access-Control-Allow-Headers: Content-Type, X-Share-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function out(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function db(array $config): PDO {
    return new PDO((string)$config['db_dsn'], (string)$config['db_user'], (string)$config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function migrate(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS shared_chats (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS federation_learning_audit (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_type VARCHAR(48) NOT NULL,
        subject VARCHAR(160) DEFAULT NULL,
        score DECIMAL(5,3) DEFAULT NULL,
        detail_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_learning_audit_created (created_at),
        KEY idx_learning_audit_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function base_url(array $config): string {
    $configured = rtrim((string)($config['public_base_url'] ?? 'https://ai.codega.com.tr/api/federation'), '/');
    return $configured . '/share';
}

function clean_title(mixed $value): string {
    $title = trim(preg_replace('/\s+/u', ' ', (string)$value));
    $title = $title === '' ? 'CODEGA AI Sohbeti' : $title;
    return function_exists('mb_substr') ? mb_substr($title, 0, 140, 'UTF-8') : substr($title, 0, 140);
}

function clean_messages(mixed $messages, array $config): array {
    $limit = max(1, min(500, (int)($config['max_share_messages'] ?? 200)));
    $maxChars = max(1000, min(100000, (int)($config['max_share_text_chars'] ?? 20000)));
    $out = [];
    $used = 0;
    foreach (array_slice(is_array($messages) ? $messages : [], 0, $limit) as $message) {
        if (!is_array($message)) continue;
        $role = (string)($message['role'] ?? '');
        if (!in_array($role, ['user', 'assistant'], true)) continue;
        $text = rtrim((string)($message['text'] ?? ''));
        if ($text === '') continue;
        $left = $maxChars - $used;
        if ($left <= 0) break;
        $text = function_exists('mb_substr') ? mb_substr($text, 0, $left, 'UTF-8') : substr($text, 0, $left);
        $used += strlen($text);
        $out[] = ['role' => $role, 'text' => $text, 'created_at' => (int)($message['createdAt'] ?? 0)];
    }
    if (!$out) out(['error' => 'empty share messages'], 400);
    return $out;
}

function require_share_token(array $config): void {
    $token = (string)($config['share_token'] ?? '');
    if ($token === '') return;
    $given = $_SERVER['HTTP_X_SHARE_TOKEN'] ?? '';
    if (!hash_equals($token, (string)$given)) out(['error' => 'share token required'], 401);
}

function ip_hash(array $config): ?string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return $ip ? hash('sha256', $ip . ':' . (string)$config['admin_token']) : null;
}

function slug(PDO $db): string {
    do {
        $slug = rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
        $stmt = $db->prepare('SELECT COUNT(*) FROM shared_chats WHERE share_slug=?');
        $stmt->execute([$slug]);
    } while ((int)$stmt->fetchColumn() > 0);
    return $slug;
}

function create_share(PDO $db, array $config): never {
    require_share_token($config);
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true);
    $payload = is_array($payload) ? $payload : [];
    $title = clean_title($payload['title'] ?? '');
    $messages = clean_messages($payload['messages'] ?? [], $config);
    $slug = slug($db);
    $days = max(1, (int)($config['share_retention_days'] ?? 180));
    $stmt = $db->prepare('INSERT INTO shared_chats (share_slug,title,messages_json,message_count,created_ip_hash,expires_at,created_at) VALUES (?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY),UTC_TIMESTAMP())');
    $stmt->execute([$slug, $title, json_encode($messages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), count($messages), ip_hash($config), $days]);
    $db->prepare('INSERT INTO federation_learning_audit (event_type,subject,detail_json,created_at) VALUES (?,?,?,UTC_TIMESTAMP())')
        ->execute(['share_created', $title, json_encode(['slug' => $slug, 'message_count' => count($messages)], JSON_UNESCAPED_UNICODE)]);
    out(['status' => 'ok', 'slug' => $slug, 'url' => base_url($config) . '/' . $slug, 'expires_in_days' => $days]);
}

function view_share(PDO $db, string $slug): never {
    if (!preg_match('/^[A-Za-z0-9_-]{8,24}$/', $slug)) out(['error' => 'not found'], 404);
    $stmt = $db->prepare('SELECT * FROM shared_chats WHERE share_slug=? AND (expires_at IS NULL OR expires_at >= UTC_TIMESTAMP()) LIMIT 1');
    $stmt->execute([$slug]);
    $share = $stmt->fetch();
    if (!$share) out(['error' => 'not found'], 404);
    $db->prepare('UPDATE shared_chats SET view_count=view_count+1,last_viewed_at=UTC_TIMESTAMP() WHERE share_slug=?')->execute([$slug]);
    $messages = json_decode((string)$share['messages_json'], true) ?: [];
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . htmlspecialchars($share['title']) . ' · CODEGA AI</title>';
    echo '<style>body{margin:0;background:#050505;color:#f7f7f7;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:920px;margin:0 auto;padding:42px 22px 80px}.top{border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:22px;margin-bottom:28px}.brand{font-weight:850}.muted{color:rgba(255,255,255,.58)}h1{font-size:clamp(30px,5vw,54px)}.msg{max-width:780px;margin:18px 0;padding:20px 22px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.045);white-space:pre-wrap;line-height:1.55}.user{margin-left:auto;background:rgba(255,255,255,.09)}.role{display:block;margin-bottom:8px;color:rgba(255,255,255,.55);font-size:11px;font-weight:800;letter-spacing:.08em}</style>';
    echo '<main><section class="top"><div class="brand">CODEGA AI</div><h1>' . htmlspecialchars($share['title']) . '</h1><p class="muted">Paylaşılan sohbet · ' . htmlspecialchars($share['created_at']) . '</p></section>';
    foreach ($messages as $message) {
        $isUser = ($message['role'] ?? '') === 'user';
        echo '<article class="msg ' . ($isUser ? 'user' : '') . '"><span class="role">' . ($isUser ? 'SEN' : 'CODEGA AI') . '</span>' . htmlspecialchars((string)($message['text'] ?? '')) . '</article>';
    }
    echo '</main></html>';
    exit;
}

try {
    $db = db($config);
    if (($config['auto_migrate'] ?? true) === true) migrate($db);
    $path = trim((string)($_SERVER['PATH_INFO'] ?? ''), '/');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') create_share($db, $config);
    if ($path !== '') view_share($db, $path);
    out(['status' => 'ok', 'service' => 'CODEGA AI Share', 'endpoint' => base_url($config)]);
} catch (Throwable $e) {
    out(['error' => $e->getMessage()], 500);
}
