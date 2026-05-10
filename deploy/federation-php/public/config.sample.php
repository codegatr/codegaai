<?php
declare(strict_types=1);

return [
    'db_dsn' => 'mysql:host=localhost;dbname=codega_federation;charset=utf8mb4',
    'db_user' => 'codega_user',
    'db_pass' => 'CHANGE_ME',

    // Use at least 32 random characters.
    'admin_token' => 'CHANGE_ME_LONG_RANDOM_TOKEN',

    // CORS. Use '*' only if the endpoint is public HTTPS.
    'allow_origin' => '*',

    // Auto-create tables on first request. Disable after install if desired.
    'auto_migrate' => true,

    // Nodes counted as active for peer_count.
    'active_peer_days' => 7,

    // Max knowledge items returned per node sync.
    'max_knowledge_items' => 50,
];

