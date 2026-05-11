# CODEGA AI Federation Coordinator for DirectAdmin

Small PHP 8.3+ coordinator for the CODEGA AI federated learning network.
It is designed for shared DirectAdmin hosting with PHP-FPM and MySQL/MariaDB.

The desktop app already calls:

- `POST https://ai.codega.com.tr/api/federation/stats`
- `GET  https://ai.codega.com.tr/api/federation/knowledge`
- `GET  https://ai.codega.com.tr/api/federation/nodes`

Upload this folder's `public/` contents to `public_html/api/federation/`.

## Install

1. Create a MySQL database and user in DirectAdmin.
2. Copy `config.sample.php` to `public/config.php`.
3. Edit `public/config.php` with your database credentials and a strong admin token.
4. Upload:
   - `public/index.php`
   - `public/.htaccess`
   - `public/config.php`
5. Open:
   - `https://ai.codega.com.tr/api/federation/health`
   - `https://ai.codega.com.tr/api/federation/admin?token=YOUR_ADMIN_TOKEN`

The app auto-creates tables on first request if the MySQL user has `CREATE`
permission. If your hosting blocks that, import `schema.sql` manually.

## Privacy Model

Nodes do not send raw chats. This coordinator stores:

- hashed node id
- anonymous counters
- topic hashes
- sanitized topic summaries from public/web learning signals

The `/knowledge` endpoint distributes lightweight learning signals to other
nodes so they can prioritize local RAG/web learning.

## Security Notes

- Use HTTPS only.
- Keep `config.php` out of web listings and never commit it.
- Set a long random `admin_token`.
- Rotate the token if you accidentally share it.

