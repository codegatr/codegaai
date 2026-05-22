# CODEGA AI

**CODEGA AI**, hafızalı ve araç kullanabilen otonom dijital personel platformudur. Amaç tek bir yerel modeli “her şeyi bilir” gibi göstermek değil; yerel modelleri, güçlü bulut modellerini, RAG hafızasını, dosya/terminal/GitHub araçlarını ve güvenli federe ağı tek bir ajan omurgasında birleştirmektir.

## Güncel Durum

- Sürüm: `v4.3.8`
- Platform: Windows portable, macOS Apple Silicon portable
- Backend: Python FastAPI
- UI: PyWebView + web arayüzü
- Yerel motor: Qwen / llama.cpp GGUF
- Hafıza: SQLite + RAG/ChromaDB + proje beyni
- Federe ağ: `https://ai.codega.com.tr/api/federation`

## Temel Yetenekler

- Çoklu model orkestrasyonu: GPT-5, GPT-4.1, Claude, Gemini, Qwen, Whisper, BGE-M3 ve yerel vision sağlayıcıları için provider manifest.
- Agent OS planner: mesajdan niyet, uzman, model zinciri, araç seti, proje hafızası ve doğrulama adımlarını çıkarır.
- Project Brain: CODEGA AI, CODEGA ERP, cMiner, Tekcan Metal gibi projeler için ayrı hafıza kapsamı.
- Araç kullanımı: web araştırması, RAG hatırlama, görsel analiz, OCR, Python sandbox, dosya/ZIP üretimi, GitHub akışları.
- Otonom öğrenme: web kaynaklarını puanlayarak özetler, embedding üretir ve hafızaya alır.
- Federe öğrenme ağı: ham sohbet veya dosya göndermeden anonim konu sinyali, kalite puanı, kaynak sayısı ve güven skoru paylaşır.
- Güncelleme sistemi: GitHub release kontrolü, portable build ve yeniden başlatma akışı.
- Multimodal giriş: görsel, ekran görüntüsü, OCR, ses ve video altyapısı.

## Agent OS Katmanları

CODEGA AI artık klasik chatbot olarak değil, şu katmanları olan ajan işletim sistemi olarak tasarlanır:

1. Çoklu model sistemi
2. Gerçek hafıza ve proje beyni
3. Kendini geliştirme ve feedback hafızası
4. Araç kullanımı
5. Planner + Executor döngüsü
6. Uzman AI modları
7. Kod tabanı okuma
8. Test etme ve kendini düzeltme
9. Prompt mühendisliği motoru
10. Session + Project Brain izolasyonu
11. Kaynak puanlı gerçek zamanlı öğrenme
12. Sandbox VM / güvenli komut yürütme
13. Görsel, ses ve video anlama
14. Kontrollü deployment
15. AI Operating System yaklaşımı

Manifest endpoint’i:

```text
GET /api/orchestrate/agent-os
```

Planlama endpoint’i:

```text
POST /api/orchestrate/plan
```

Örnek plan çıktısı; uzman profili, model zinciri, araçlar, proje beyni, öğrenme politikası ve doğrulama adımlarını içerir.

## Federe Ağ

CODEGA AI kurulu her bilgisayar, isteğe bağlı olarak federe ağa katılabilir. Ağın hedefi cihazların öğrendiği konu sinyallerini birleştirip diğer cihazlara “şunu yerel olarak doğrula ve öğren” yönlendirmesi vermektir.

Federe ağ gizlilik sözleşmesi:

- Ham sohbet gönderilmez.
- Dosya gönderilmez.
- API key, token, `.env`, local path ve tam node ID gönderilmez.
- Yalnızca anonim sayaçlar ve temizlenmiş konu sinyalleri gönderilir.
- Konular kalite filtresinden geçer.
- Aynı konuyu birden çok node öğrenirse `source_count` ve `confidence` artar.

DirectAdmin/PHP koordinatör endpoint’leri:

```text
GET  /api/federation/health
GET  /api/federation/capabilities
GET  /api/federation/metrics
POST /api/federation/stats
GET  /api/federation/knowledge
GET  /api/federation/nodes
GET  /api/federation/admin?token=...
GET  /api/federation/admin/prune?token=...
```

Sunucu kurulumu:

```text
deploy/federation-php/public/
```

klasörünü DirectAdmin üzerinde `public_html/api/federation/` altına yükleyin, `config.sample.php` dosyasını `config.php` yapıp veritabanı bilgilerini girin.

## macOS Apple Silicon

macOS workflow açıkça Apple Silicon hedefler:

```yaml
runs-on: macos-15
```

Workflow `uname -m` sonucunun `arm64` olduğunu doğrular ve release dosyasını şu formatta üretir:

```text
codegaai-vX.Y.Z-macos-arm64.zip
```

Bu paket M1, M2, M3 ve M4 Apple Silicon MacBook’lar için hedeflenmiştir. Intel Mac için ayrı x64 build istenirse ayrıca `macos-13` / x64 hedefli ikinci workflow eklenmelidir.

## Kurulum

Windows:

```text
Releases sayfasından codegaai-vX.Y.Z-windows.zip indir
D:\2-CODEGAAI\ altına çıkar
codegaai.exe çalıştır
```

macOS Apple Silicon:

```text
Releases sayfasından codegaai-vX.Y.Z-macos-arm64.zip indir
Arşivi çıkar
dist/codegaai/codegaai çalıştır
```

Geliştirici kurulumu:

```bash
git clone https://github.com/codegatr/codegaai.git
cd codegaai
python -m pip install -r requirements.txt
python launcher.py
```

## Önemli API Grupları

| Grup | Endpoint |
| --- | --- |
| Sohbet | `/api/jobs/chat`, `/api/stream/chat` |
| Hafıza | `/api/memory/search`, `/api/memory/learn`, `/api/memory/ensure-embedding` |
| Orkestrasyon | `/api/orchestrate/platform`, `/api/orchestrate/agent-os`, `/api/orchestrate/plan` |
| Federe Ağ | `/api/federation/status`, `/api/federation/sync`, `/api/federation/capabilities` |
| Görsel | `/api/vision/analyze`, `/api/vision/ocr` |
| Dosya | `/api/files/upload`, `/api/files/pack`, `/api/files/project` |
| Sandbox | `/api/sandbox/run`, `/api/sandbox/analyze` |
| GitHub/Kod | `/api/codebase/*`, `/api/devtools/*`, `/api/powertools/*` |
| Sistem | `/api/system/info`, `/api/system/health`, `/api/models/*` |

## Güvenlik İlkeleri

- Token ve API key değerleri maskelenir.
- `.env` ve gizli config içerikleri modele ham verilmez.
- Riskli araçlar onay politikasıyla ayrılır.
- İnternetten gelen içerik doğrudan komut olarak çalıştırılmaz.
- Federe ağ yalnızca anonim ve kalite filtresinden geçmiş sinyal taşır.

## Lisans

MIT License - Copyright 2026 CODEGA
