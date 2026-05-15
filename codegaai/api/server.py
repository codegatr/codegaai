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

    # HF Token'ı başlangıçta yükle (indirme uyarısını engelle)
    try:
        from codegaai.core.models_registry import _get_hf_token
        tok = _get_hf_token()
        if tok:
            log.info("HuggingFace token yüklendi ✓")
        else:
            log.info("HuggingFace token yok — Ayarlar'dan ekleyebilirsiniz")
    except Exception:
        pass

    # Sohbet veritabanını başlat (gerekirse oluşturur)
    from codegaai.core.chat_store import ChatStore
    ChatStore.open()

    # Faz 3: model registry hazırla (dizinler oluşturulur)
    from codegaai.core.models_registry import ModelRegistry
    ModelRegistry.get()

    # NOT: LLM ve embedding motorları lazy yüklenir.
    # İlk kullanıma kadar bellekte yer kaplamaz.

    # Zamanlayıcı — on_event("startup") deprecated, buraya taşındı
    try:
        from codegaai.core.scheduler import setup_scheduler
        setup_scheduler()
        log.info("Zamanlayıcı başlatıldı (Faz 10)")
    except Exception as exc:
        log.warning("Zamanlayıcı başlatılamadı: %s", exc)

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

    # ---- CORS — masaüstü modunda lokal, server modunda config'e göre ----
    cfg = get_config()
    server_cfg = cfg.get("server", {})
    is_server_mode = server_cfg.get("mode") == "server"
    cors_origins = list(server_cfg.get("cors_origins") or [])

    if is_server_mode and cors_origins:
        # Public deployment — sadece izin verilen origin'ler
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        log.info("CORS: server modu, izin verilen origin'ler: %s", cors_origins)
    else:
        # Masaüstü modu — sadece localhost
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[
                "http://127.0.0.1",
                "http://localhost",
                "null",
            ],
            allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # ---- Auth middleware (yetkisiz isteği login sayfasına yönlendirir) ----
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import RedirectResponse
    from codegaai.api.auth import (
        is_auth_enabled, get_token, get_session_cookie_name,
        constant_time_compare,
    )

    # Auth istemeyen yollar (login akışı + statikler + sağlık)
    PUBLIC_PATHS = {
        "/login", "/api/auth/login", "/api/auth/logout",
        "/api/auth/status", "/api", "/api/system/health",
        "/api/docs", "/api/redoc", "/api/openapi.json",
        "/favicon.ico",
    }
    PUBLIC_PREFIXES = ("/css/", "/js/", "/img/", "/ui/static/")

    class AuthRedirectMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            if not is_auth_enabled():
                return await call_next(request)

            path = request.url.path
            if path in PUBLIC_PATHS or any(
                path.startswith(p) for p in PUBLIC_PREFIXES
            ):
                return await call_next(request)

            # Cookie kontrolü
            cookie_val = request.cookies.get(get_session_cookie_name(), "")
            expected = get_token()
            if cookie_val and constant_time_compare(cookie_val, expected):
                return await call_next(request)

            # Bearer header kontrolü (API çağrıları)
            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer "):
                token = auth_header[7:].strip()
                if constant_time_compare(token, expected):
                    return await call_next(request)

            # API ise 401, sayfa ise login redirect
            if path.startswith("/api/"):
                return JSONResponse({"detail": "Yetkisiz"}, status_code=401)
            return RedirectResponse(url="/login", status_code=302)

    app.add_middleware(AuthRedirectMiddleware)

    # ---- API rotaları ----
    from codegaai.api.routes import system as system_routes
    from codegaai.api.routes import models as models_routes
    from codegaai.api.routes import chats as chats_routes
    from codegaai.api.routes import chat as chat_routes
    from codegaai.api.routes import image as image_routes
    from codegaai.api.routes import video as video_routes
    from codegaai.api.routes import audio as audio_routes
    from codegaai.api.routes import memory as memory_routes
    from codegaai.api.routes import learning as learning_routes
    from codegaai.api.routes import updater as updater_routes
    from codegaai.api.routes import auth as auth_routes
    from codegaai.api.routes import learn as learn_routes
    from codegaai.api.routes import profile as profile_routes

    # Auth rotaları (prefix YOK — /login direk olmalı)
    app.include_router(auth_routes.router, tags=["auth"])

    app.include_router(system_routes.router, prefix="/api/system", tags=["system"])
    app.include_router(models_routes.router, prefix="/api/models", tags=["models"])
    app.include_router(chats_routes.router,  prefix="/api/chats",  tags=["chats"])
    app.include_router(chat_routes.router,   prefix="/api/chat",   tags=["chat"])
    app.include_router(image_routes.router,  prefix="/api/image",  tags=["image"])
    app.include_router(video_routes.router,  prefix="/api/video",  tags=["video"])
    app.include_router(audio_routes.router,  prefix="/api/audio",  tags=["audio"])
    app.include_router(memory_routes.router, prefix="/api/memory", tags=["memory"])
    app.include_router(learning_routes.router, prefix="/api/learning", tags=["learning"])
    app.include_router(updater_routes.router, prefix="/api/updater", tags=["updater"])
    app.include_router(learn_routes.router,  prefix="/api/learn",  tags=["learn"])
    app.include_router(profile_routes.router, prefix="/api/profile", tags=["profile"])

    # Streaming chat (SSE)
    from codegaai.api.routes import stream as stream_routes
    from codegaai.api.routes import vision as vision_routes
    from codegaai.api.routes import federation as federation_routes
    app.include_router(stream_routes.router, prefix="/api/chat", tags=["stream"])
    app.include_router(vision_routes.router, prefix="/api/vision", tags=["vision"])
    app.include_router(federation_routes.router, prefix="/api/federation", tags=["federation"])

    from codegaai.api.routes import autolearn as autolearn_routes
    from codegaai.api.routes import setup as setup_routes
    from codegaai.api.routes import jobs as jobs_routes
    from codegaai.api.routes import files as files_routes
    app.include_router(autolearn_routes.router, prefix="/api/autolearn", tags=["autolearn"])
    app.include_router(setup_routes.router, prefix="/api/setup", tags=["setup"])
    app.include_router(jobs_routes.router, prefix="/api/jobs", tags=["jobs"])
    app.include_router(files_routes.router, prefix="/api/files", tags=["files"])
    from codegaai.api.routes import sandbox as sandbox_routes
    app.include_router(sandbox_routes.router, prefix="/api/sandbox", tags=["sandbox"])
    from codegaai.api.routes import agent as agent_routes
    app.include_router(agent_routes.router, prefix="/api/agent", tags=["agent"])
    from codegaai.api.routes import finetune as finetune_routes
    app.include_router(finetune_routes.router, prefix="/api/finetune", tags=["finetune"])
    from codegaai.api.routes import orchestrator as orch_routes
    app.include_router(orch_routes.router, prefix="/api/orchestrate", tags=["orchestrate"])
    from codegaai.api.routes import wakeword as wakeword_routes
    app.include_router(wakeword_routes.router, prefix="/api/wakeword", tags=["wakeword"])
    from codegaai.api.routes import plugins as plugins_routes
    app.include_router(plugins_routes.router, prefix="/api/plugins", tags=["plugins"])
    from codegaai.api.routes import translate as translate_routes
    app.include_router(translate_routes.router, prefix="/api/translate", tags=["translate"])
    from codegaai.api.routes import calendar as calendar_routes
    app.include_router(calendar_routes.router, prefix="/api/calendar", tags=["calendar"])
    from codegaai.api.routes import mobile as mobile_routes
    app.include_router(mobile_routes.router, prefix="/api/mobile", tags=["mobile"])
    from codegaai.api.routes import screen as screen_routes
    app.include_router(screen_routes.router, prefix="/api/screen", tags=["screen"])
    from codegaai.api.routes import gpu as gpu_routes
    app.include_router(gpu_routes.router, prefix="/api/gpu", tags=["gpu"])
    from codegaai.api.routes import codebase as codebase_routes
    app.include_router(codebase_routes.router, prefix="/api/codebase", tags=["codebase"])
    from codegaai.api.routes import codex_plus as codex_routes
    app.include_router(codex_routes.router, prefix="/api/codex_plus", tags=["codex_plus"])
    from codegaai.api.routes import advanced as advanced_routes
    app.include_router(advanced_routes.router, prefix="/api/advanced", tags=["advanced"])

    # Setup.html — ilk kurulum sayfası
    from fastapi.responses import FileResponse

    @app.get("/setup")
    async def setup_page():
        from pathlib import Path
        _ui_dir = Path(__file__).parent.parent / "ui" / "web"
        setup_html = _ui_dir / "setup.html"
        if setup_html.exists():
            return FileResponse(str(setup_html))
        return {"error": "setup.html bulunamadı"}

    # Zamanlayıcıyı başlat + modelleri otomatik yükle
    # Startup logic lifespan'e taşındı
    async def _start_scheduler():
        try:
            from codegaai.core.scheduler import setup_scheduler
            setup_scheduler()
            log.info("Zamanlayıcı başlatıldı (Faz 10)")
        except Exception as exc:
            log.warning("Zamanlayıcı başlatılamadı: %s", exc)

        # Otomatik öğrenme — idle'da arka planda çalışır
        def _start_auto_learn():
            import time
            time.sleep(5)  # Sistem tamamen hazır olsun
            try:
                from codegaai.core.autonomous_learner import AutonomousLearner
                AutonomousLearner.get().start()
                log.info("Otonom öğrenme başlatıldı (idle'da çalışacak)")
            except Exception as exc:
                log.warning("Otonom öğrenme başlatılamadı: %s", exc)

        threading.Thread(target=_start_auto_learn, daemon=True,
                         name="auto-learn-starter").start()

        def _start_web_learning():
            import time
            learning_cfg = get_config().get("learning", {})
            if not learning_cfg.get("enabled", True):
                log.info("Açılış internet öğrenmesi: learning.enabled=false, atlandı")
                return
            if not learning_cfg.get("auto_web_learn_on_startup", True):
                log.info("Açılış internet öğrenmesi devre dışı")
                return

            delay = int(learning_cfg.get("startup_web_learn_delay_seconds", 20) or 20)
            time.sleep(max(0, delay))
            try:
                from codegaai.core.web_learner import WebLearner
                learner = WebLearner.get()
                if learner.status.get("state") != "idle":
                    log.info("Açılış internet öğrenmesi: başka öğrenme aktif, atlandı")
                    return
                learner.learn_async(feeds=True)
                log.info("Açılış internet öğrenmesi başlatıldı (RSS/feed)")
            except Exception as exc:
                log.warning("Açılış internet öğrenmesi başlatılamadı: %s", exc)

        threading.Thread(target=_start_web_learning, daemon=True,
                         name="startup-web-learner").start()

        cfg = get_config()
        server_cfg = cfg.get("server", {})
        if server_cfg.get("auto_load_model", True):
            import threading
            def _auto_load():
                import time
                time.sleep(3)  # FastAPI tamamen ayağa kalksın
                log.info("Otomatik model yükleme başlıyor...")
                try:
                    from codegaai.core.models_registry import ModelRegistry
                    from codegaai.core.engine import LLMEngine
                    from codegaai.core.embeddings import EmbeddingService

                    reg = ModelRegistry.get()
                    engine = LLMEngine.get()

                    # İndirilmiş modelleri listele — detaylı log
                    all_models = reg.list_llm_models()
                    downloaded = []
                    for m in all_models:
                        is_dl = reg.is_llm_downloaded(m["id"])
                        log.info("  Model kontrol: %s → %s",
                                 m["id"], "✓ indirilmiş" if is_dl else "✗ yok")
                        if is_dl:
                            downloaded.append(m)

                    if not downloaded:
                        log.info("Otomatik yükleme: İndirilmiş model yok, atlandı")
                    elif engine.is_ready:
                        log.info("Motor zaten hazır: %s", engine._status.model_id)
                    else:
                        # Önce varsayılan, yoksa ilk indirilen
                        default = next(
                            (m for m in downloaded if m.get("default")),
                            downloaded[0],
                        )
                        log.info("Otomatik model yükleme: %s", default["id"])
                        engine.load(default["id"])
                        log.info("Otomatik yükleme tamamlandı: %s",
                                 default["id"])

                    # BGE-M3 otomatik yükle — embedding şart
                    if server_cfg.get("auto_load_embedding", True):
                        emb = EmbeddingService.get()
                        if not emb.is_ready:
                            is_dl = reg.is_embedding_downloaded("bge-m3")
                            log.info("BGE-M3 kontrol: %s",
                                     "✓ indirilmiş" if is_dl else "✗ indirilmemiş")
                            if is_dl:
                                log.info("Otomatik embedding yükleme: bge-m3")
                                try:
                                    emb.load("bge-m3")
                                    log.info("BGE-M3 yüklendi ✓")
                                except Exception as emb_err:
                                    log.warning("BGE-M3 yüklenemedi: %s", emb_err)
                            elif server_cfg.get("auto_download_embedding", True):
                                log.info("BGE-M3 indirilmemiş — arka planda indiriliyor")
                                def _dl_and_load_emb():
                                    try:
                                        t = reg.download_snapshot_async("bge-m3", spec_kind="embedding")
                                        t.join()
                                        progress = reg.get_progress("bge-m3")
                                        if progress.status == "completed":
                                            log.info("BGE-M3 indirildi, yükleniyor...")
                                            EmbeddingService.get().load("bge-m3")
                                            log.info("BGE-M3 hazır ✓ (arka planda indirildi)")
                                        else:
                                            log.warning("BGE-M3 indirme başarısız: %s", progress.error)
                                    except Exception as e:
                                        log.warning("BGE-M3 arka plan indirme hatası: %s", e)
                                import threading as _th
                                _th.Thread(target=_dl_and_load_emb, daemon=True,
                                           name="emb-auto-dl").start()

                except OSError as exc:
                    if "0xc000001d" in str(exc).lower() or "-1073741795" in str(exc):
                        log.error(
                            "OTOMATİK YÜKLEME BAŞARISIZ — CPU AVX2 uyumsuzluğu! "
                            "fix_llama.bat dosyasını çalıştırın."
                        )
                    else:
                        log.error("Otomatik model yükleme OSError: %s", exc)
                except Exception as exc:
                    log.error("Otomatik model yükleme başarısız: %s", exc,
                              exc_info=True)

            threading.Thread(target=_auto_load, daemon=True,
                             name="auto-loader").start()

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

        # CSS, JS, img, assets için kısayollar
        for sub in ("css", "js", "img", "assets"):
            sub_path = UI_ROOT / sub
            if sub_path.exists():
                app.mount(
                    f"/{sub}",
                    StaticFiles(directory=str(sub_path)),
                    name=f"ui-{sub}",
                )

    # ---- Üretilen çıktılar (Faz 4+) ----
    from codegaai.config import OUTPUTS_DIR
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/outputs",
        StaticFiles(directory=str(OUTPUTS_DIR)),
        name="outputs",
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
