"""
codegaai.ui.window
====================

PyWebView ile masaüstü penceresi.

Sunucu arkaplanda çalışır; bu modül pencereyi açar ve sunucudaki UI'ı
yükler. Pencere kapatıldığında sunucu da durur.
"""

from __future__ import annotations

import sys
import time
from typing import Optional

from codegaai import __version__
from codegaai.api.server import ServerThread
from codegaai.config import get_config
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


def open_window(host: str = "127.0.0.1",
                port: int = 8765,
                width: int = 1400,
                height: int = 900,
                wait_timeout: float = 30.0) -> int:
    """
    Sunucuyu başlat ve PyWebView penceresini aç.

    Returns:
        Çıkış kodu (0 = başarılı).
    """
    try:
        import webview  # type: ignore[import-not-found]
    except ImportError:
        log.error(
            "pywebview yüklü değil. Yüklemek için:\n"
            "    pip install pywebview"
        )
        return 1

    log.info("Backend sunucusu başlatılıyor...")
    server = ServerThread(host=host, port=port)
    server.start()

    if not server.wait_ready(timeout=wait_timeout):
        log.error("Sunucu %s saniye içinde hazır olmadı.", wait_timeout)
        return 1

    # İlk kurulum kontrolü
    try:
        from codegaai.api.routes.setup import is_setup_done
        if not is_setup_done():
            url = f"http://{host}:{port}/setup"
            log.info("İlk kurulum gerekli — sihirbaz açılıyor")
        else:
            url = f"http://{host}:{port}/"
    except Exception:
        url = f"http://{host}:{port}/"

    log.info("Sunucu hazır: http://%s:%s/", host, port)
    log.info("PyWebView penceresi açılıyor...")
    try:
        webview.create_window(
            title=f"CODEGA AI v{__version__}",
            url=url,
            width=width,
            height=height,
            min_size=(1000, 640),
            background_color="#0a0b0d",
            text_select=True,
            resizable=True,
            confirm_close=False,
        )
        # gui parametresi: Windows'ta edgechromium (WebView2), macOS'ta cocoa,
        # Linux'ta gtk veya qt. None bırakırsak PyWebView otomatik seçer.
        webview.start(debug=False)
    except Exception as exc:
        log.exception("Pencere açılamadı: %s", exc)
        server.stop()
        return 1
    finally:
        log.info("Pencere kapatıldı, sunucu durduruluyor...")
        server.stop()

    return 0


def open_in_browser(host: str = "127.0.0.1", port: int = 8765,
                    wait_timeout: float = 30.0) -> int:
    """
    PyWebView yoksa veya headless modda — sunucuyu başlat ve sistem
    tarayıcısında aç.
    """
    import webbrowser

    server = ServerThread(host=host, port=port)
    server.start()

    if not server.wait_ready(timeout=wait_timeout):
        log.error("Sunucu %s saniye içinde hazır olmadı.", wait_timeout)
        return 1

    url = f"http://{host}:{port}/"
    log.info("Sunucu hazır: %s", url)
    log.info("Tarayıcı açılıyor...")
    webbrowser.open(url)

    log.info("Sunucu çalışıyor. Çıkmak için Ctrl+C.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Kullanıcı çıktı, sunucu durduruluyor.")
        server.stop()

    return 0
