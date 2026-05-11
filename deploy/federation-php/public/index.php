<?php
declare(strict_types=1);

const APP_NAME = 'CODEGA AI Federation Coordinator';
const APP_VERSION = '1.0.0';

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.sample.php';
}
$config = require $configPath;

header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: ' . ($config['allow_origin'] ?? '*'));
header('Access-Control-Allow-Headers: Content-Type, X-Node-ID');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400): never
{
    json_response(['error' => $message], $status);
}

function pdo(array $config): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $pdo = new PDO(
        (string)$config['db_dsn'],
        (string)$config['db_user'],
        (string)$config['db_pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    return $pdo;
}

function migrate(PDO $db): void
{
    $db->exec("
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS federation_knowledge (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          item_id CHAR(64) NOT NULL,
          origin_hash VARCHAR(16) NOT NULL,
          topic VARCHAR(160) NOT NULL,
          body TEXT NOT NULL,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_federation_knowledge_item (item_id),
          KEY idx_federation_knowledge_created (created_at),
          KEY idx_federation_knowledge_origin (origin_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS federation_events (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          event_type VARCHAR(32) NOT NULL,
          node_label VARCHAR(16) DEFAULT NULL,
          message VARCHAR(255) DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_federation_events_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function route_path(): string
{
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $marker = '/api/federation';
    $pos = strpos($uri, $marker);
    if ($pos !== false) {
        $path = substr($uri, $pos + strlen($marker));
    } else {
        $script = dirname($_SERVER['SCRIPT_NAME'] ?? '');
        $path = substr($uri, strlen($script));
    }
    $path = '/' . trim((string)$path, '/');
    return $path === '/' ? '/health' : $path;
}

function body_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function node_id_from_request(array $data): string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $nodeId = $headers['X-Node-ID'] ?? $headers['x-node-id'] ?? '';
    if (!$nodeId && isset($_SERVER['HTTP_X_NODE_ID'])) {
        $nodeId = (string)$_SERVER['HTTP_X_NODE_ID'];
    }
    if (!$nodeId && isset($data['data']['node_id'])) {
        $nodeId = (string)$data['data']['node_id'];
    }
    if (!$nodeId) {
        fail('missing X-Node-ID', 400);
    }
    return substr($nodeId, 0, 128);
}

function node_hash(string $nodeId, array $config): string
{
    return hash('sha256', $nodeId . ':' . (string)$config['admin_token']);
}

function node_label(string $hash): string
{
    return substr($hash, 0, 12);
}

function sanitize_topic(mixed $topic): string
{
    $topic = preg_replace('/\s+/u', ' ', trim((string)$topic));
    $topic = preg_replace('/[^\p{L}\p{N}\s\.\,\:\+\#\/\-\(\)]/u', '', $topic);
    $topic = $topic ?? '';
    return function_exists('mb_substr')
        ? mb_substr($topic, 0, 120, 'UTF-8')
        : substr($topic, 0, 120);
}

function utf8_lower(string $text): string
{
    return function_exists('mb_strtolower')
        ? mb_strtolower($text, 'UTF-8')
        : strtolower($text);
}

function active_peer_count(PDO $db, array $config): int
{
    $days = max(1, (int)($config['active_peer_days'] ?? 7));
    $stmt = $db->prepare("SELECT COUNT(*) FROM federation_nodes WHERE last_seen >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)");
    $stmt->execute([$days]);
    return (int)$stmt->fetchColumn();
}

function handle_stats(PDO $db, array $config): never
{
    $payload = body_json();
    $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
    $hash = node_hash(node_id_from_request($payload), $config);
    $label = node_label($hash);
    $feedback = is_array($data['feedbacks'] ?? null) ? $data['feedbacks'] : [];
    $topicHashes = array_values(array_slice((array)($data['topic_hashes'] ?? []), 0, 50));
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ipHash = $ip ? hash('sha256', $ip . ':' . (string)$config['admin_token']) : null;

    $stmt = $db->prepare("
        INSERT INTO federation_nodes
          (node_hash, node_label, version, last_seen, conversation_count,
           feedback_positive, feedback_negative, feedback_total, adapter_count,
           topic_hashes_json, stats_json, ip_hash)
        VALUES
          (?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          version = VALUES(version),
          last_seen = VALUES(last_seen),
          conversation_count = VALUES(conversation_count),
          feedback_positive = VALUES(feedback_positive),
          feedback_negative = VALUES(feedback_negative),
          feedback_total = VALUES(feedback_total),
          adapter_count = VALUES(adapter_count),
          topic_hashes_json = VALUES(topic_hashes_json),
          stats_json = VALUES(stats_json),
          ip_hash = VALUES(ip_hash)
    ");
    $stmt->execute([
        $hash,
        $label,
        substr((string)($data['version'] ?? ''), 0, 64),
        max(0, (int)($data['conversation_count'] ?? 0)),
        max(0, (int)($feedback['positive'] ?? 0)),
        max(0, (int)($feedback['negative'] ?? 0)),
        max(0, (int)($feedback['total'] ?? 0)),
        max(0, (int)($data['adapter_count'] ?? 0)),
        json_encode($topicHashes, JSON_UNESCAPED_UNICODE),
        json_encode($data, JSON_UNESCAPED_UNICODE),
        $ipHash,
    ]);

    $created = 0;
    $topics = array_values(array_unique(array_filter(array_map('sanitize_topic', (array)($data['topic_summaries'] ?? [])))));
    $insert = $db->prepare("
        INSERT IGNORE INTO federation_knowledge
          (item_id, origin_hash, topic, body, created_at)
        VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
    ");
    foreach (array_slice($topics, 0, 20) as $topic) {
        $itemId = hash('sha256', $label . ':' . utf8_lower($topic));
        $body = "Federated learning signal: another CODEGA AI node learned about '{$topic}'. Prioritize local web/RAG learning for this topic.";
        $insert->execute([$itemId, $label, $topic, $body]);
        $created += $insert->rowCount() > 0 ? 1 : 0;
    }

    json_response([
        'status' => 'ok',
        'peer_count' => active_peer_count($db, $config),
        'knowledge_created' => $created,
    ]);
}

function handle_knowledge(PDO $db, array $config): never
{
    $payload = ['data' => ['node_id' => '']];
    $nodeId = $_SERVER['HTTP_X_NODE_ID'] ?? '';
    $origin = $nodeId ? node_label(node_hash((string)$nodeId, $config)) : '';
    $since = max(0.0, (float)($_GET['since'] ?? 0));
    $limit = max(1, min(200, (int)($config['max_knowledge_items'] ?? 50)));

    $stmt = $db->prepare("
        SELECT item_id, origin_hash, topic, body, UNIX_TIMESTAMP(created_at) AS ts
        FROM federation_knowledge
        WHERE active = 1
          AND UNIX_TIMESTAMP(created_at) > ?
          AND (? = '' OR origin_hash <> ?)
        ORDER BY created_at ASC
        LIMIT {$limit}
    ");
    $stmt->execute([$since, $origin, $origin]);
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $items[] = [
            'id' => $row['item_id'],
            'text' => $row['body'],
            'topic' => $row['topic'],
            'peer_hash' => $row['origin_hash'],
            'ts' => (float)$row['ts'],
        ];
    }

    json_response([
        'items' => $items,
        'peer_count' => active_peer_count($db, $config),
    ]);
}

function handle_nodes(PDO $db, array $config): never
{
    $days = max(1, (int)($config['active_peer_days'] ?? 7));
    $stmt = $db->prepare("
        SELECT node_label, version, UNIX_TIMESTAMP(last_seen) AS last_seen,
               conversation_count, feedback_total, adapter_count
        FROM federation_nodes
        WHERE last_seen >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        ORDER BY last_seen DESC
        LIMIT 200
    ");
    $stmt->execute([$days]);
    json_response([
        'nodes' => $stmt->fetchAll(),
        'peer_count' => active_peer_count($db, $config),
    ]);
}

function require_admin(array $config): void
{
    $token = (string)($_GET['token'] ?? $_POST['token'] ?? '');
    if (!hash_equals((string)$config['admin_token'], $token)) {
        http_response_code(401);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">';
        echo '<title>CODEGA Federation Admin</title>';
        echo '<style>body{font-family:system-ui;background:#0b0d10;color:#eef2f7;display:grid;place-items:center;min-height:100vh}form{background:#151922;border:1px solid #2a3140;padding:24px;border-radius:8px}input,button{font:inherit;padding:10px;border-radius:6px;border:1px solid #384152}button{background:#f59e0b;color:#111827;font-weight:700}</style>';
        echo '<form method="get"><h1>CODEGA Federation</h1><p>Admin token</p><input name="token" type="password" autofocus> <button>Login</button></form>';
        exit;
    }
}

function handle_admin(PDO $db, array $config): never
{
    require_admin($config);
    $peerCount = active_peer_count($db, $config);
    $nodeCount = (int)$db->query("SELECT COUNT(*) FROM federation_nodes")->fetchColumn();
    $knowledgeCount = (int)$db->query("SELECT COUNT(*) FROM federation_knowledge WHERE active=1")->fetchColumn();
    $nodes = $db->query("SELECT node_label, version, last_seen, conversation_count, feedback_total, adapter_count FROM federation_nodes ORDER BY last_seen DESC LIMIT 50")->fetchAll();
    $knowledge = $db->query("SELECT topic, origin_hash, created_at FROM federation_knowledge WHERE active=1 ORDER BY created_at DESC LIMIT 50")->fetchAll();

    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>CODEGA Federation Admin</title>';
    echo '<style>body{margin:0;font-family:system-ui;background:#0b0d10;color:#eef2f7}main{max-width:1100px;margin:0 auto;padding:32px}h1{margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card,table{background:#151922;border:1px solid #2a3140;border-radius:8px}.card{padding:18px}.num{font-size:32px;color:#f59e0b;font-weight:800}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:10px;border-bottom:1px solid #2a3140}th{color:#94a3b8}.muted{color:#94a3b8}</style>';
    echo '<main><h1>CODEGA AI Federation Admin</h1><div class="grid">';
    echo '<div class="card"><div class="muted">Active peers</div><div class="num">' . $peerCount . '</div></div>';
    echo '<div class="card"><div class="muted">Total nodes</div><div class="num">' . $nodeCount . '</div></div>';
    echo '<div class="card"><div class="muted">Knowledge signals</div><div class="num">' . $knowledgeCount . '</div></div>';
    echo '</div><h2>Recent nodes</h2><table><tr><th>Node</th><th>Version</th><th>Last seen</th><th>Chats</th><th>Feedback</th><th>Adapters</th></tr>';
    foreach ($nodes as $n) {
        echo '<tr><td>' . htmlspecialchars($n['node_label']) . '</td><td>' . htmlspecialchars($n['version']) . '</td><td>' . htmlspecialchars($n['last_seen']) . '</td><td>' . (int)$n['conversation_count'] . '</td><td>' . (int)$n['feedback_total'] . '</td><td>' . (int)$n['adapter_count'] . '</td></tr>';
    }
    echo '</table><h2>Recent knowledge</h2><table><tr><th>Topic</th><th>Origin</th><th>Created</th></tr>';
    foreach ($knowledge as $k) {
        echo '<tr><td>' . htmlspecialchars($k['topic']) . '</td><td>' . htmlspecialchars($k['origin_hash']) . '</td><td>' . htmlspecialchars($k['created_at']) . '</td></tr>';
    }
    echo '</table></main>';
    exit;
}

try {
    $db = pdo($config);
    if (($config['auto_migrate'] ?? true) === true) {
        migrate($db);
    }

    $route = route_path();
    if ($route === '/health') {
        json_response(['status' => 'ok', 'service' => APP_NAME, 'version' => APP_VERSION]);
    }
    if ($route === '/stats' || $route === '/coordinator/stats') {
        handle_stats($db, $config);
    }
    if ($route === '/knowledge' || $route === '/coordinator/knowledge') {
        handle_knowledge($db, $config);
    }
    if ($route === '/nodes' || $route === '/coordinator/nodes') {
        handle_nodes($db, $config);
    }
    if ($route === '/admin') {
        handle_admin($db, $config);
    }
    fail('not found', 404);
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}
