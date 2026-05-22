<?php
declare(strict_types=1);

const APP_NAME = 'CODEGA AI Federation Coordinator';
const APP_VERSION = '1.2.0';
const PROTOCOL_VERSION = 2;
const PRIVACY_MODE = 'anonymous_topic_signals_only';
const MIN_TOPIC_QUALITY = 0.45;

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
    ensure_column($db, 'federation_knowledge', 'topic_key', "ALTER TABLE federation_knowledge ADD COLUMN topic_key CHAR(24) DEFAULT NULL AFTER origin_hash");
    ensure_column($db, 'federation_knowledge', 'quality', "ALTER TABLE federation_knowledge ADD COLUMN quality DECIMAL(5,3) NOT NULL DEFAULT 0.000 AFTER body");
    ensure_index($db, 'federation_knowledge', 'idx_federation_knowledge_topic', "ALTER TABLE federation_knowledge ADD INDEX idx_federation_knowledge_topic (topic_key)");
}

function ensure_column(PDO $db, string $table, string $column, string $sql): void
{
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);
    if ((int)$stmt->fetchColumn() === 0) {
        $db->exec($sql);
    }
}

function ensure_index(PDO $db, string $table, string $index, string $sql): void
{
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
    ");
    $stmt->execute([$table, $index]);
    if ((int)$stmt->fetchColumn() === 0) {
        $db->exec($sql);
    }
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

function topic_quality(string $topic): float
{
    $topic = sanitize_topic($topic);
    if ($topic === '' || strlen($topic) < 4) {
        return 0.0;
    }
    if (preg_match('/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/', $topic)
        || preg_match('/\bhf_[A-Za-z0-9]{20,}\b/', $topic)
        || preg_match('/\bsk-[A-Za-z0-9_-]{20,}\b/', $topic)
        || preg_match('/\b(api[_-]?key|token|secret|password|passwd)\s*[:=]/i', $topic)) {
        return 0.0;
    }
    $len = max(1, strlen($topic));
    $letters = preg_match_all('/\p{L}/u', $topic);
    $digits = preg_match_all('/\p{N}/u', $topic);
    $words = preg_split('/\s+/u', trim($topic)) ?: [];
    $score = 0.35;
    $score += min(0.25, $len / 240);
    $score += count(array_filter($words)) >= 2 ? 0.2 : 0.0;
    $score += ($letters / $len) >= 0.35 ? 0.15 : -0.2;
    $score += $digits <= 12 ? 0.05 : -0.1;
    if (in_array(utf8_lower($topic), ['change', 'update', 'test', 'error', 'issue', 'bug', 'fix', 'help'], true)) {
        $score -= 0.35;
    }
    return max(0.0, min(1.0, $score));
}

function topic_key(string $topic): string
{
    return substr(hash('sha256', utf8_lower(sanitize_topic($topic))), 0, 24);
}

function signal_confidence(int $sourceCount, float $quality): float
{
    $base = 0.25 + min(0.35, max(0, $sourceCount - 1) * 0.12);
    return round(max(0.0, min(0.98, $base + ($quality * 0.4))), 3);
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

function log_event(PDO $db, string $eventType, ?string $nodeLabel, string $message = ''): void
{
    $stmt = $db->prepare("INSERT INTO federation_events (event_type, node_label, message, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())");
    $stmt->execute([substr($eventType, 0, 32), $nodeLabel, substr($message, 0, 255)]);
}

function prune_old_events(PDO $db, array $config): int
{
    $days = max(1, (int)($config['event_retention_days'] ?? 30));
    $stmt = $db->prepare("DELETE FROM federation_events WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)");
    $stmt->execute([$days]);
    return $stmt->rowCount();
}

function enforce_rate_limit(PDO $db, array $config, string $ipHash): void
{
    $window = max(30, (int)($config['rate_limit_window_seconds'] ?? 300));
    $limit = max(10, (int)($config['rate_limit_stats_per_window'] ?? 120));
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM federation_events
        WHERE event_type = 'stats'
          AND message = ?
          AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)
    ");
    $stmt->execute([$ipHash, $window]);
    if ((int)$stmt->fetchColumn() >= $limit) {
        fail('rate limit exceeded', 429);
    }
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
    if ($ipHash) {
        enforce_rate_limit($db, $config, $ipHash);
    }

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
          (item_id, origin_hash, topic_key, topic, body, quality, created_at)
        VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
    ");
    foreach (array_slice($topics, 0, 20) as $topic) {
        $quality = topic_quality($topic);
        if ($quality < MIN_TOPIC_QUALITY) {
            continue;
        }
        $itemId = hash('sha256', $label . ':' . utf8_lower($topic));
        $key = topic_key($topic);
        $body = "Federated learning signal: another CODEGA AI node learned about '{$topic}'. Prioritize local web/RAG learning for this topic.";
        $insert->execute([$itemId, $label, $key, $topic, $body, $quality]);
        $created += $insert->rowCount() > 0 ? 1 : 0;
    }
    if ($ipHash) {
        log_event($db, 'stats', $label, $ipHash);
    }

    json_response([
        'status' => 'ok',
        'peer_count' => active_peer_count($db, $config),
        'knowledge_created' => $created,
        'protocol_version' => PROTOCOL_VERSION,
        'privacy_mode' => PRIVACY_MODE,
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
        SELECT
          MIN(item_id) AS item_id,
          COALESCE(MIN(topic_key), SUBSTRING(SHA2(LOWER(MIN(topic)), 256), 1, 24)) AS topic_key,
          MIN(topic) AS topic,
          GROUP_CONCAT(DISTINCT origin_hash ORDER BY origin_hash SEPARATOR ',') AS peer_hashes,
          COUNT(DISTINCT origin_hash) AS source_count,
          MAX(quality) AS stored_quality,
          MAX(UNIX_TIMESTAMP(created_at)) AS ts
        FROM federation_knowledge
        WHERE active = 1
          AND UNIX_TIMESTAMP(created_at) > ?
          AND (? = '' OR origin_hash <> ?)
        GROUP BY COALESCE(topic_key, LOWER(topic))
        ORDER BY MAX(created_at) ASC
        LIMIT {$limit}
    ");
    $stmt->execute([$since, $origin, $origin]);
    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $topic = (string)$row['topic'];
        $quality = max(topic_quality($topic), (float)($row['stored_quality'] ?? 0));
        if ($quality < MIN_TOPIC_QUALITY) {
            continue;
        }
        $sourceCount = max(1, (int)$row['source_count']);
        $items[] = [
            'id' => $row['topic_key'] ?: topic_key($topic),
            'text' => "Federated learning signal: CODEGA AI network observed {$sourceCount} node(s) learning about '{$topic}'. Prioritize local web/RAG verification for this topic before using it in answers.",
            'topic' => $topic,
            'peer_hash' => $row['peer_hashes'],
            'source_count' => $sourceCount,
            'confidence' => signal_confidence($sourceCount, $quality),
            'quality' => round($quality, 3),
            'ts' => (float)$row['ts'],
            'protocol_version' => PROTOCOL_VERSION,
        ];
    }

    json_response([
        'items' => $items,
        'peer_count' => active_peer_count($db, $config),
        'protocol_version' => PROTOCOL_VERSION,
        'privacy_mode' => PRIVACY_MODE,
    ]);
}

function coordinator_metrics(PDO $db, array $config): array
{
    $activePeers = active_peer_count($db, $config);
    $nodeCount = (int)$db->query("SELECT COUNT(*) FROM federation_nodes")->fetchColumn();
    $knowledgeCount = (int)$db->query("SELECT COUNT(*) FROM federation_knowledge WHERE active=1")->fetchColumn();
    $topicCount = (int)$db->query("SELECT COUNT(DISTINCT COALESCE(topic_key, LOWER(topic))) FROM federation_knowledge WHERE active=1")->fetchColumn();
    $lastSync = $db->query("SELECT MAX(last_seen) FROM federation_nodes")->fetchColumn() ?: null;
    return [
        'active_peers' => $activePeers,
        'total_nodes' => $nodeCount,
        'knowledge_signals' => $knowledgeCount,
        'unique_topics' => $topicCount,
        'last_node_seen' => $lastSync,
        'protocol_version' => PROTOCOL_VERSION,
        'privacy_mode' => PRIVACY_MODE,
    ];
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
    $knowledge = $db->query("SELECT topic, origin_hash, quality, created_at FROM federation_knowledge WHERE active=1 ORDER BY created_at DESC LIMIT 50")->fetchAll();

    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>CODEGA Federation Admin</title>';
    echo '<style>body{margin:0;font-family:system-ui;background:#0b0d10;color:#eef2f7}main{max-width:1100px;margin:0 auto;padding:32px}h1{margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card,table{background:#151922;border:1px solid #2a3140;border-radius:8px}.card{padding:18px}.num{font-size:32px;color:#f59e0b;font-weight:800}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:10px;border-bottom:1px solid #2a3140}th{color:#94a3b8}.muted{color:#94a3b8}</style>';
    echo '<main><h1>CODEGA AI Federation Admin</h1><p class="muted">Protocol v' . PROTOCOL_VERSION . ' · ' . htmlspecialchars(PRIVACY_MODE) . '</p><div class="grid">';
    echo '<div class="card"><div class="muted">Active peers</div><div class="num">' . $peerCount . '</div></div>';
    echo '<div class="card"><div class="muted">Total nodes</div><div class="num">' . $nodeCount . '</div></div>';
    echo '<div class="card"><div class="muted">Knowledge signals</div><div class="num">' . $knowledgeCount . '</div></div>';
    echo '</div><h2>Recent nodes</h2><table><tr><th>Node</th><th>Version</th><th>Last seen</th><th>Chats</th><th>Feedback</th><th>Adapters</th></tr>';
    foreach ($nodes as $n) {
        echo '<tr><td>' . htmlspecialchars($n['node_label']) . '</td><td>' . htmlspecialchars($n['version']) . '</td><td>' . htmlspecialchars($n['last_seen']) . '</td><td>' . (int)$n['conversation_count'] . '</td><td>' . (int)$n['feedback_total'] . '</td><td>' . (int)$n['adapter_count'] . '</td></tr>';
    }
    echo '</table><h2>Recent knowledge</h2><table><tr><th>Topic</th><th>Origin</th><th>Quality</th><th>Created</th></tr>';
    foreach ($knowledge as $k) {
        echo '<tr><td>' . htmlspecialchars($k['topic']) . '</td><td>' . htmlspecialchars($k['origin_hash']) . '</td><td>' . htmlspecialchars((string)$k['quality']) . '</td><td>' . htmlspecialchars($k['created_at']) . '</td></tr>';
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
        json_response([
            'status' => 'ok',
            'service' => APP_NAME,
            'version' => APP_VERSION,
            'protocol_version' => PROTOCOL_VERSION,
            'privacy_mode' => PRIVACY_MODE,
            'metrics' => coordinator_metrics($db, $config),
        ]);
    }
    if ($route === '/capabilities') {
        json_response([
            'protocol_version' => PROTOCOL_VERSION,
            'privacy_mode' => PRIVACY_MODE,
            'shares' => ['anonymous node heartbeat', 'aggregate counters', 'sanitized public topic signals'],
            'never_shares' => ['raw chat text', 'files', 'API keys or tokens', 'local paths', 'full node id'],
            'quality_gate' => ['min_topic_quality' => MIN_TOPIC_QUALITY],
        ]);
    }
    if ($route === '/metrics') {
        json_response(coordinator_metrics($db, $config));
    }
    if ($route === '/admin/prune') {
        require_admin($config);
        json_response(['ok' => true, 'deleted_events' => prune_old_events($db, $config)]);
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
