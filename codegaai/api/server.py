"""
codegaai.api.server
====================

Yerel FastAPI mikroservisi.

Sadece 127.0.0.1'e bağlanır — dışarıya açılmaz. PyWebView penceresi
bu sunucudaki UI'ı yükler ve API çağrıları yapar.

Sunucuyu programatik başlatmak için:

    from codegaai.api.server import run_server
    run_server(host="127.0.0.1", port=8765)
"""

from __future__ import annotations

import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from codegaai import __version__, __phase__
from codegaai.config import get_config, get_paths
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

# UI dosyalarının kökü
UI_ROOT: Path = Path(__file__).resolve().parent.parent / "ui" / "web"


# ============================================================
# Yaşam döngüsü
# ============================================================

@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Uygulama başlama/bitme olayları."""
    log.info("FastAPI başlatılıyor (CODEGA AI v%s)", __version__)
    log.info("Faz: %s", __phase__)

    # Faz 3+ ile burada motorlar yüklenecek
    # app.state.llm = LLMEngine.load(...)
    # app.state.memory = MemoryStore.open(...)

    yield

    log.info("FastAPI kapanıyor")


# ============================================================
# Uygulama oluşturucu
# ============================================================

def create_app() -> FastAPI:
    """FastAPI uygulamasını yapılandır ve döndür."""
    app = FastAPI(
        title="CODEGA AI",
        description="Yerelde çalışan, kendi kendine öğrenen yapay zeka mikroservisi",
        version=__version__,
        lifespan=_lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # CORS - sadece localhost
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1",
            "http://localhost",
            "null",  # PyWebView'in file:// kontekstinde origin null olabilir
        ],
        allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ---- API rotaları ----
    from codegaai.api.routes import system as system_routes
    from codegaai.api.routes import chat as chat_routes
    from codegaai.api.routes import image as image_routes
    from codegaai.api.routes import video as video_routes
    from codegaai.api.routes import audio as audio_routes
    from codegaai.api.routes import memory as memory_routes

    app.include_router(system_routes.router, prefix="/api/system", tags=["system"])
    app.include_router(chat_routes.router,   prefix="/api/chat",   tags=["chat"])
    app.include_router(image_routes.router,  prefix="/api/image",  tags=["image"])
    app.include_router(video_routes.router,  prefix="/api/video",  tags=["video"])
    app.include_router(audio_routes.router,  prefix="/api/audio",  tags=["audio"])
    app.include_router(memory_routes.router, prefix="/api/memory", tags=["memory"])

    # ---- Statik UI dosyaları ----
    if UI_ROOT.exists():
        app.mount(
            "/ui/static",
            StaticFiles(directory=str(UI_ROOT)),
            name="ui-static",
        )

        @app.get("/", include_in_schema=False)
        async def root() -> FileResponse:
            """Kök yol → UI ana sayfası."""
            index = UI_ROOT / "index.html"
            if index.exists():
                return FileResponse(str(index), media_type="text/html")
            return JSONResponse(
                {"error": "UI bulunamadı", "ui_root": str(UI_ROOT)},
                status_code=500,
            )

        # CSS, JS, img için kısayollar
        for sub in ("css", "js", "img"):
            sub_path = UI_ROOT / sub
            if sub_path.exists():
                app.mount(
                    f"/{sub}",
                    StaticFiles(directory=str(sub_path)),
                    name=f"ui-{sub}",
                )

    @app.get("/api", include_in_schema=False)
    async def api_root() -> dict:
        return {
            "name": "CODEGA AI",
            "version": __version__,
            "phase": __phase__,
            "docs": "/api/docs",
        }

    return app


# Modül seviyesinde tek örnek (uvicorn import için)
app: FastAPI = create_app()


# ============================================================
# Programatik başlatıcı
# ============================================================

class ServerThread(threading.Thread):
    """uvicorn'u arka planda thread olarak çalıştırır."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8765,
                 log_level: str = "info") -> None:
        super().__init__(daemon=True, name="codegaai-server")
        self.host = host
        self.port = port
        self.log_level = log_level
        self._server: Optional["uvicorn.Server"] = None  # type: ignore[name-defined]
        self._ready = threading.Event()

    def run(self) -> None:
        import uvicorn

        config = uvicorn.Config(
            app=app,
            host=self.host,
            port=self.port,
            log_level=self.log_level,
            access_log=False,
        )
        self._server = uvicorn.Server(config)
        # Hazır olduğunda flag'i kaldır (uvicorn started_callback yok, polling)
        threading.Thread(
            target=self._poll_ready, daemon=True
        ).start()
        self._server.run()

    def _poll_ready(self) -> None:
        """Sunucu cevap verene kadar bekle."""
        import socket
        for _ in range(150):  # ~30 saniye
            try:
                with socket.create_connection(
                    (self.host, self.port), timeout=0.5
                ):
                    self._ready.set()
                    return
            except (OSError, socket.timeout):
                time.sleep(0.2)

    def wait_ready(self, timeout: float = 30.0) -> bool:
        """Sunucu hazır olana kadar bekle."""
        return self._ready.wait(timeout)

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True


def run_server(host: Optional[str] = None,
               port: Optional[int] = None,
               log_level: Optional[str] = None) -> None:
    """
    Sunucuyu **bloklayıcı** olarak çalıştır (geliştirici / test için).
    UI ile birlikte başlatmak için ServerThread kullanın.
    """
    cfg = get_config()
    server_cfg = cfg.get("server", {})

    actual_host = host or server_cfg.get("host", "127.0.0.1")
    actual_port = port or int(server_cfg.get("port", 8765))
    actual_level = log_level or server_cfg.get("log_level", "info")

    # Veri dizinleri hazır olduğundan emin ol
    paths = get_paths()
    for p in paths.values():
        if isinstance(p, Path) and p.suffix == "":
            p.mkdir(parents=True, exist_ok=True)

    log.info("Sunucu dinleniyor: http://%s:%d", actual_host, actual_port)
    log.info("UI: http://%s:%d/", actual_host, actual_port)
    log.info("API docs: http://%s:%d/api/docs", actual_host, actual_port)

    import uvicorn
    uvicorn.run(
        "codegaai.api.server:app",
        host=actual_host,
        port=actual_port,
        log_level=actual_level,
        access_log=False,
        reload=False,
    )
