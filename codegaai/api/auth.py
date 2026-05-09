"""
codegaai.api.auth
==================

Token tabanlı kimlik doğrulama (Faz 9 - public deployment).

İki kabul edilen yöntem:
1. **Bearer token**: `Authorization: Bearer <token>` header
2. **Cookie session**: `/api/auth/login` ile cookie alındıktan sonra
   tarayıcıda otomatik gönderilir

Token boş ise (config'te ya da env'de) auth tamamen devre dışıdır
(masaüstü modu — tek kullanıcı, lokal binding). Server modunda
mutlaka token zorunludur.

Token oluşturmak: `openssl rand -hex 32`
Set: `export CODEGAAI_AUTH__TOKEN=...`
"""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Cookie, Header, HTTPException, Request, Response, status

from codegaai.config import get_config
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


def get_token() -> str:
    """Yapılandırmadan auth token'ı çek. Boş ise auth devre dışı."""
    cfg = get_config()
    return (cfg.get("auth", {}).get("token") or "").strip()


def is_auth_enabled() -> bool:
    return bool(get_token())


def get_session_cookie_name() -> str:
    cfg = get_config()
    return cfg.get("auth", {}).get("session_cookie", "codegaai_session")


def get_cookie_secure() -> bool:
    cfg = get_config()
    return bool(cfg.get("auth", {}).get("cookie_secure", False))


def get_session_max_age() -> int:
    cfg = get_config()
    return int(cfg.get("auth", {}).get("session_max_age", 30 * 24 * 3600))


def constant_time_compare(a: str, b: str) -> bool:
    """Zamanlama saldırısına dayanıklı string karşılaştırma."""
    return secrets.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


async def require_auth(
    request: Request,
    authorization: Optional[str] = Header(None),
    session_cookie: Optional[str] = Cookie(None,
                                            alias="codegaai_session"),
) -> bool:
    """
    FastAPI Depends() — koruma gerektiren endpoint'lerde kullanılır.

    Auth devre dışıysa (masaüstü modu) her zaman geçer.
    Aktifse: Bearer header VEYA cookie ile token doğrulanmalı.
    """
    expected = get_token()
    if not expected:
        return True  # auth disabled

    # Bearer header
    if authorization:
        parts = authorization.strip().split(None, 1)
        if (len(parts) == 2 and parts[0].lower() == "bearer"
                and constant_time_compare(parts[1], expected)):
            return True

    # Cookie
    if session_cookie and constant_time_compare(session_cookie, expected):
        return True

    # IP bilgisi loga (denial loglamak için)
    client = request.client.host if request.client else "?"
    log.warning("Auth başarısız: %s %s from %s",
                request.method, request.url.path, client)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Yetkisiz",
        headers={"WWW-Authenticate": "Bearer"},
    )


def set_session_cookie(response: Response, token: str) -> None:
    """Login sonrası tarayıcıya session cookie'sini ayarla."""
    response.set_cookie(
        key=get_session_cookie_name(),
        value=token,
        max_age=get_session_max_age(),
        httponly=True,
        secure=get_cookie_secure(),
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    """Logout — cookie'yi sil."""
    response.delete_cookie(
        key=get_session_cookie_name(),
        httponly=True,
        secure=get_cookie_secure(),
        samesite="lax",
    )


def verify_login(submitted_token: str) -> bool:
    """Login form'dan gelen token'ı doğrula."""
    expected = get_token()
    if not expected:
        return True
    return constant_time_compare(submitted_token.strip(), expected)
