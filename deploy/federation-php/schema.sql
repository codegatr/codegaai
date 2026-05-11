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
  topic VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_federation_knowledge_item (item_id),
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

