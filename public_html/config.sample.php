<?php
declare(strict_types=1);

return [
    'db_dsn' => 'mysql:host=localhost;dbname=codega_ai;charset=utf8mb4',
    'db_user' => 'codega_ai',
    'db_pass' => 'PRBtTqvsqbc9xC9B2Hzg',

    // Use at least 32 random characters.
    'admin_token' => 'Nesiwo4829477adadafafahshadshad',

    // CORS. Use '*' only if the endpoint is public HTTPS.
    'allow_origin' => '*',

    // Public URL where this folder is reachable.
    'public_base_url' => 'https://ai.codega.com.tr/api/federation',

    // Optional shared secret for desktop share creation. Leave empty for public beta.
    'share_token' => '',

    // Auto-create tables on first request. Disable after install if desired.
    'auto_migrate' => true,

    // Nodes counted as active for peer_count.
    'active_peer_days' => 7,

    // Max knowledge items returned per node sync.
    'max_knowledge_items' => 50,

    // Basic abuse guard for public shared hosting coordinators.
    'rate_limit_window_seconds' => 300,
    'rate_limit_stats_per_window' => 120,

    // Old event rows are pruned automatically to keep shared hosting small.
    'event_retention_days' => 30,

    // Public chat share retention.
    'share_retention_days' => 180,
    'max_share_messages' => 200,
    'max_share_text_chars' => 20000,
];
