# CODEGA AI — Windows Build

Bu dizin, **GitHub Actions** üzerinde her `v*` tag'inde otomatik olarak
çalışan Windows derleme yapılandırmasını içerir.

## Otomatik build (önerilen yol)

Yeni bir tag pushlandığında, `.github/workflows/build-windows.yml`
tetiklenir ve `windows-latest` runner'ında şu adımları yapar:

1. Python 3.12 kurar
2. Tüm bağımlılıkları yükler (CPU `torch` + `llama-cpp-python`
   + `sentence-transformers` + `chromadb` dahil)
3. `pyinstaller build/codegaai.spec` ile `dist/codegaai/` üretir
4. Klasörü `codegaai-{tag}-windows-cpu.zip` olarak sıkıştırır
5. GitHub Release'e otomatik iliştirir

Tag oluşturmak için:

```bash
git tag v0.3.1
git push origin v0.3.1
```

15-20 dakika sonra
[Releases sayfasında](https://github.com/codegatr/codegaai/releases)
ZIP dosyası hazır olur.

## Yerel build (geliştirici notları)

Normalde gerekmez — release'i GitHub Actions üretiyor. Ama yerel test için:

```powershell
# Python 3.12 sanal ortam
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip install pyinstaller

# Build
.\.venv\Scripts\pyinstaller.exe build\codegaai.spec --noconfirm --clean

# Test
.\dist\codegaai\codegaai.exe
```

## ZIP içeriği

İndirilen `codegaai-vX.Y.Z-windows-cpu.zip` içinde:

```
codegaai/
├── codegaai.exe                <- çift tıkla, çalışır
├── _internal/
│   ├── python312.dll
│   ├── llama_cpp/              <- LLM motor DLL'leri
│   ├── torch/                  <- CPU torch
│   ├── sentence_transformers/
│   ├── chromadb/
│   ├── codegaai/ui/web/        <- arayüz dosyaları
│   ├── manifest.json
│   └── ... (300+ paket)
```

## Veri dizini

Frozen modda CODEGA AI verileri **`%LOCALAPPDATA%\CODEGA AI\data`** altına yazar:

```
C:\Users\<kullanici>\AppData\Local\CODEGA AI\data\
├── models/
│   ├── llm/
│   │   └── qwen2.5-7b-instruct-q4_k_m.gguf   (~5 GB, ilk indirmede)
│   └── embedding/
│       └── bge-m3/
├── memory/
│   ├── chats.db                 (SQLite sohbet geçmişi)
│   └── chroma/                  (ChromaDB vektörleri)
├── cache/
└── logs/
```

İlk açılışta UI'dan **Sistem → LLM Modelleri → Qwen 2.5 7B → İndir**
butonuyla model indirilir.

## Notlar

- **CPU build**: Mevcut workflow CPU torch kullanıyor. RTX 3060+ sahipleri
  inferansı GPU'da çalıştırmak için kurulum sonrası şu komutu manuel
  çalıştırmalı (veya CUDA build çıkana kadar bekleyebilir):
  
  ```powershell
  .\_internal\python.exe -m pip install --upgrade llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121
  ```

- **Konsol penceresi**: İlk sürümde `console=True`, hata teşhisi için
  açık. v1.0.0 (Faz 8) sürümünde `--windowed` moduna geçilecek.

- **İmzalama**: Şu anda imzalı değil — Windows SmartScreen "bilinmeyen
  yayıncı" uyarısı verecek. "Yine de çalıştır" tıkla. İleride EV code
  signing sertifikası alındığında bu kalkar.
