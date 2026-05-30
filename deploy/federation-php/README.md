# CODEGA AI Federation Coordinator for DirectAdmin

PHP 8.3+ coordinator for the CODEGA AI federated learning network, public
chat share links, status checks, and admin monitoring.
It is designed for shared DirectAdmin hosting with PHP-FPM and MySQL/MariaDB.
Protocol v2 aggregates the same topic across multiple installed CODEGA AI
nodes and returns `source_count`, `confidence`, `quality`, and
`protocol_version` with every distributed learning signal.

The desktop app already calls:

- `POST https://ai.codega.com.tr/api/federation/stats`
- `GET  https://ai.codega.com.tr/api/federation/knowledge`
- `GET  https://ai.codega.com.tr/api/federation/nodes`
- `GET  https://ai.codega.com.tr/api/federation/capabilities`
- `GET  https://ai.codega.com.tr/api/federation/status`
- `POST https://ai.codega.com.tr/api/federation/share`
- `GET  https://ai.codega.com.tr/api/federation/share/{slug}`

Upload this folder's `public/` contents to `public_html/api/federation/`.

## Install

1. Create a MySQL database and user in DirectAdmin.
2. Copy `config.sample.php` to `public/config.php`.
3. Edit `public/config.php` with your database credentials and a strong admin token.
4. Upload:
   - `public/index.php`
   - `public/.htaccess`
   - `public/share/`
   - `public/status/`
   - `public/config.php`
5. Open:
   - `https://ai.codega.com.tr/api/federation/health`
   - `https://ai.codega.com.tr/api/federation/status`
   - `https://ai.codega.com.tr/api/federation/admin?token=YOUR_ADMIN_TOKEN`

The app auto-creates tables on first request if the MySQL user has `CREATE`
permission. If your hosting blocks that, import `schema.sql` manually.

## DirectAdmin Layout

Recommended upload target:

- `domains/ai.codega.com.tr/public_html/api/federation/index.php`
- `domains/ai.codega.com.tr/public_html/api/federation/.htaccess`
- `domains/ai.codega.com.tr/public_html/api/federation/share/index.php`
- `domains/ai.codega.com.tr/public_html/api/federation/status/index.php`
- `domains/ai.codega.com.tr/public_html/api/federation/config.php`

Set `public_base_url` in `config.php` to:

```php
'public_base_url' => 'https://ai.codega.com.tr/api/federation',
```

The desktop app can then create links such as:

```text
https://ai.codega.com.tr/api/federation/share/abc123...
```

If you later want shorter links like `https://ai.codega.com.tr/s/abc123`,
add a DirectAdmin/Apache rewrite from `/s/{slug}` to
`/api/federation/share/{slug}`.

## Admin Panel

The admin panel tracks:

- active federation peers
- total registered nodes
- learned topic signals
- public shared chat links
- autonomous learning audit events

Maintenance endpoint:

- `GET /api/federation/admin/prune?token=YOUR_ADMIN_TOKEN`

This prunes old events and expired shared chats.

## Privacy Model

Nodes do not send raw chats. This coordinator stores:

- hashed node id
- anonymous counters
- topic hashes
- sanitized topic summaries from public/web learning signals

Raw chat text is stored only when the user explicitly presses the share-link
action. Shared chats are separate from federation learning and are not returned
from `/knowledge`.

The `/knowledge` endpoint distributes lightweight learning signals to other
nodes so they can prioritize local RAG/web learning.

Quality filters reject generic one-word signals such as `change`, and obvious
secret-like content such as GitHub, HuggingFace, OpenAI-style tokens, API keys,
passwords, and local secrets. This keeps the network useful without turning it
into a raw data collection point.

## Security Notes

- Use HTTPS only.
- Keep `config.php` out of web listings and never commit it.
- Set a long random `admin_token`.
- Rotate the token if you accidentally share it.

---

## Kurulum Sihirbazı (install.php) — en kolay yol

1. `public/` klasörünün tamamını (install.php dahil) sunucuda
   `ai.codega.com.tr` altında `.../api/federation/` olacak şekilde yükle.
2. MySQL/MariaDB'de bir veritabanı + kullanıcı oluştur (DirectAdmin → MySQL Management).
3. Tarayıcıda aç: `https://ai.codega.com.tr/api/federation/install.php`
4. Formu doldur (DB bilgileri + admin token otomatik üretilir) → **Kur ve Test Et**.
   Sihirbaz tabloları oluşturur, `config.php` yazar ve bağlantıyı test eder.
5. Bittiğinde **install.php dosyasını sil** (güvenlik).
6. Doğrula: `https://ai.codega.com.tr/api/federation/health` JSON dönmeli.

## "403 / cf-mitigated: challenge" alıyorsan (Cloudflare)

Site Cloudflare arkasındaysa masaüstü uygulamasının isteği challenge'a takılıp
`403` alır (tarayıcı olmadığı için challenge çözülemez). Çözüm (birini seç):

- **WAF Skip kuralı (önerilen):** Cloudflare → Security → WAF → Custom rules:
  `URI Path starts with "/api/federation"` → Action: **Skip** (Managed Rules,
  Bot Fight Mode, Security Level). İstersen daha dar: header
  `X-Codega-Client equals codega-desktop` (uygulama bu başlığı gönderir).
- **Bot Fight Mode kapat:** Security → Bots → Bot Fight Mode = Off.
- **Proxy'yi kapat:** Bu hostun DNS kaydını "DNS only / gri bulut" yap (API için).

Doğru kurulduğunda `health` uç noktası tarayıcıda JSON dönüyorsa, uygulamadan
"Link olarak paylaş" gerçek bir `https://.../share/<slug>` linki üretir.
