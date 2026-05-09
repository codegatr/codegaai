"""
Kimlik doğrulama uç noktaları (Faz 9 - public deployment).

GET  /login              — login HTML sayfası (auth aktifse)
POST /api/auth/login     — token'ı doğrula, session cookie ver
POST /api/auth/logout    — cookie sil
GET  /api/auth/status    — auth durumu (login mi, mode ne)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from codegaai.api.auth import (
    clear_session_cookie, is_auth_enabled, set_session_cookie, verify_login,
    get_token,
)
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class LoginRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=256)


@router.get("/api/auth/status")
async def auth_status(request: Request) -> dict:
    """Auth durumu — UI giriş ekranı göstermeli mi?"""
    cookie_name = "codegaai_session"
    cookie_val = request.cookies.get(cookie_name, "")
    expected = get_token()
    is_logged_in = bool(expected and cookie_val == expected)

    return {
        "auth_enabled": is_auth_enabled(),
        "is_logged_in": is_logged_in or not is_auth_enabled(),
    }


@router.post("/api/auth/login")
async def login(req: LoginRequest, response: Response) -> dict:
    if not is_auth_enabled():
        return {"ok": True, "message": "Auth devre dışı"}

    if not verify_login(req.token):
        # Brute force korumak için biraz beklet (hash compare zaten constant
        # time ama yine ek tedbir)
        import time
        time.sleep(0.5)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz token",
        )

    set_session_cookie(response, req.token.strip())
    log.info("Auth login başarılı")
    return {"ok": True}


@router.post("/api/auth/logout")
async def logout(response: Response) -> dict:
    clear_session_cookie(response)
    return {"ok": True}


# Login HTML sayfası (auth aktifse, oturumu olmayan kullanıcılar buraya yönlenir)
LOGIN_HTML = """<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CODEGA AI - Giriş</title>
  <style>
    :root {
      --bg: #0a0b0d;
      --bg-elev: #14161a;
      --border: #2a2d33;
      --text: #e8e9ed;
      --muted: #8b8e95;
      --accent: #f59e0b;
      --accent-hover: #fbbf24;
      --danger: #ef4444;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont,
        'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: var(--bg-elev);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 48px 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    }
    .logo {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, var(--accent), var(--accent-hover));
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      color: var(--bg);
      margin: 0 auto 24px;
    }
    h1 {
      text-align: center;
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .subtitle {
      text-align: center;
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 32px;
    }
    label {
      display: block;
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 8px;
      font-weight: 500;
    }
    input {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px 16px;
      font-size: 14px;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      border-radius: 8px;
      margin-bottom: 16px;
      transition: border-color 0.15s;
    }
    input:focus {
      outline: none;
      border-color: var(--accent);
    }
    button {
      width: 100%;
      background: var(--accent);
      color: var(--bg);
      border: none;
      padding: 14px 20px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: var(--accent-hover); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .error {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--danger);
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
      display: none;
    }
    .error.visible { display: block; }
    .help {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }
    .help code {
      background: var(--bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <form class="card" onsubmit="return doLogin(event)">
    <div class="logo">C</div>
    <h1>CODEGA AI</h1>
    <p class="subtitle">Devam etmek için giriş yapın</p>

    <div class="error" id="error"></div>

    <label for="token">Erişim Anahtarı</label>
    <input type="password" id="token" name="token" autofocus
           autocomplete="current-password"
           placeholder="••••••••••••••••••••••••••••••••">

    <button type="submit" id="submit-btn">Giriş Yap</button>

    <div class="help">
      Anahtar sunucu yöneticisi tarafından sağlanır. Unuttuysanız
      sunucu üzerinden <code>/etc/codegaai/auth.env</code>
      dosyasına bakın.
    </div>
  </form>

  <script>
    async function doLogin(e) {
      e.preventDefault();
      const token = document.getElementById('token').value;
      const errorEl = document.getElementById('error');
      const btn = document.getElementById('submit-btn');

      errorEl.classList.remove('visible');
      btn.disabled = true;
      btn.textContent = 'Doğrulanıyor...';

      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (r.ok) {
          // Anasayfaya yönlen
          window.location.href = '/';
        } else {
          const data = await r.json().catch(() => ({}));
          errorEl.textContent = data.detail || 'Giriş başarısız';
          errorEl.classList.add('visible');
          btn.disabled = false;
          btn.textContent = 'Giriş Yap';
          document.getElementById('token').select();
        }
      } catch (err) {
        errorEl.textContent = 'Bağlantı hatası: ' + err.message;
        errorEl.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Giriş Yap';
      }
      return false;
    }
  </script>
</body>
</html>
"""


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request) -> HTMLResponse:
    """Auth aktifse login formu, değilse direkt anasayfaya yönlen."""
    if not is_auth_enabled():
        return RedirectResponse(url="/", status_code=302)

    # Zaten giriş yapmışsa anasayfaya
    cookie_val = request.cookies.get("codegaai_session", "")
    if cookie_val and cookie_val == get_token():
        return RedirectResponse(url="/", status_code=302)

    return HTMLResponse(content=LOGIN_HTML)
