# Dört Yapay Zeka Karşılaştırması — CODEGA AI v3.3.0

| Özellik | ChatGPT | Gemini | CODEX | Claude | **CODEGA** |
|---------|:-------:|:------:|:-----:|:------:|:----------:|
| Türkçe Sohbet | ✅ | ✅ | ✅ | ✅ | ✅ |
| Web Araması | ✅ Bing | ✅ Google | ✅ | ✅ | ✅ DDG |
| Canvas / Artifact | ✅ | ✅ | ❌ | ✅ | ✅ |
| PDF Okuma | ✅ | ✅ | ✅ | ✅ | ✅ PyMuPDF |
| Kod Çalıştırma | ✅ | ✅ | ✅ | ✅ | ✅ Sandbox |
| Grafik Üretme | ✅ | ✅ | ✅ | ✅ | ✅ matplotlib |
| CSV/Excel Analizi | ✅ | ✅ | ✅ | ✅ | ✅ pandas |
| Görüntü Anlama | ✅ GPT-4V | ✅ | ✅ | ✅ | ✅ moondream |
| **Ekran Anlama** | ✅ | ✅ | ✅ | ✅ | ✅ YENİ |
| Görsel Üretimi | ✅ DALL-E 3 | ✅ Imagen | ❌ | ❌ | ✅ SDXL |
| **Ses Sohbeti (Streaming)** | ✅ Voice | ✅ | ❌ | ❌ | ✅ YENİ |
| GitHub Push/PR | ❌ | ❌ | ✅ | ❌ | ✅ |
| Otomatik Test | ❌ | ❌ | ✅ | ❌ | ✅ |
| ZIP Proje Üretimi | ❌ | ❌ | ✅ | ❌ | ✅ |
| Derin Düşünme (CoT) | ✅ o1/o3 | ✅ | ❌ | ✅ | ✅ |
| Çok Adımlı Ajan | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bağımlılık Analizi | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Diffusion Fine-tune** | ❌ | ❌ | ❌ | ❌ | ✅ YENİ |
| **Çoklu Model Orkestrasyon** | ❌ | ❌ | ❌ | ❌ | ✅ YENİ |
| Otonom Öğrenme | ❌ | ❌ | ❌ | ❌ | ✅ **Benzersiz** |
| Self-Learning / DPO | ❌ | ❌ | ❌ | ❌ | ✅ **Benzersiz** |
| Uzun Dönem Bellek | ✅ | ✅ | ❌ | ✅ | ✅ Profil+RAG |
| Yerel / Offline | ❌ | ❌ | ❌ | ❌ | ✅ **Benzersiz** |
| Gizlilik | ❌ Bulut | ❌ Bulut | ❌ Bulut | ❌ Bulut | ✅ **Tam Yerel** |
| Ücret | $20/ay | $20/ay | Kurumsal | $20/ay | ✅ **Ücretsiz** |

## Tüm API Endpoint'leri

| Grup | Endpoint | Açıklama |
|------|----------|----------|
| Sohbet | POST /api/jobs/chat | LLM sohbet (polling) |
| Sohbet | GET /api/jobs/{id} | Cevap durumu |
| Dosya | POST /api/files/upload | ZIP/dosya yükle |
| Dosya | POST /api/files/project | PHP projesi üret |
| Dosya | POST /api/files/pack | Kodları ZIP yap |
| Dosya | GET /api/files/download/{id} | ZIP indir |
| Dosya | POST /api/files/read-pdf | PDF oku |
| Dosya | POST /api/files/github/push | GitHub push |
| Dosya | POST /api/files/github/pr | PR oluştur |
| Dosya | POST /api/files/generate/tests | Test yaz |
| Sandbox | POST /api/sandbox/run | Python çalıştır |
| Sandbox | POST /api/sandbox/chart | Grafik üret |
| Sandbox | POST /api/sandbox/analyze | CSV analizi |
| Sandbox | POST /api/sandbox/deps | Bağımlılık analizi |
| Ajan | POST /api/agent/start | Çok adımlı ajan |
| Ajan | GET /api/agent/{id} | Ajan durumu |
| Vision | POST /api/vision/screenshot | Ekran anlama |
| Vision | POST /api/vision/screenshot/code | Kod çıkart |
| Ses | POST /api/audio/voice-chat | Tam ses döngüsü |
| Ses | GET /api/audio/stream-tts | Streaming TTS |
| Fine-tune | POST /api/finetune/upload | Görsel yükle |
| Fine-tune | POST /api/finetune/dreambooth | DreamBooth |
| Fine-tune | POST /api/finetune/textual | Textual Inversion |
| Orkestra | POST /api/orchestrate/auto | En iyi model seç |
| Orkestra | POST /api/orchestrate/vote | Çoğunluk oyu |
| Orkestra | POST /api/orchestrate/chain | Model zinciri |
