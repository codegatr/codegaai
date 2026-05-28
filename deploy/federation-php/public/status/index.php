<?php
declare(strict_types=1);

$configPath = dirname(__DIR__) . '/config.php';
if (!is_file($configPath)) {
    $configPath = dirname(__DIR__) . '/config.sample.php';
}
$config = require $configPath;

header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');

try {
    $db = new PDO((string)$config['db_dsn'], (string)$config['db_user'], (string)$config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $metrics = [
        'active_peers' => (int)$db->query("SELECT COUNT(*) FROM federation_nodes WHERE last_seen >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)")->fetchColumn(),
        'total_nodes' => (int)$db->query("SELECT COUNT(*) FROM federation_nodes")->fetchColumn(),
        'knowledge_signals' => (int)$db->query("SELECT COUNT(*) FROM federation_knowledge WHERE active=1")->fetchColumn(),
        'shared_chats' => (int)$db->query("SELECT COUNT(*) FROM shared_chats WHERE expires_at IS NULL OR expires_at >= UTC_TIMESTAMP()")->fetchColumn(),
        'learning_audit_events' => (int)$db->query("SELECT COUNT(*) FROM federation_learning_audit")->fetchColumn(),
    ];
    echo json_encode([
        'status' => 'ok',
        'service' => 'CODEGA AI Cloud Status',
        'version' => '1.3.0',
        'public_base_url' => $config['public_base_url'] ?? 'https://ai.codega.com.tr/api/federation',
        'metrics' => $metrics,
        'capabilities' => [
            'chat_share_links',
            'federated_topic_signals',
            'node_status_tracking',
            'admin_monitoring',
            'autonomous_learning_audit',
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
