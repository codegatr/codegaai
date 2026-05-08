@echo off
REM ============================================================
REM CODEGA AI - Windows Kurulum Betiği
REM ============================================================
REM Python 3.10-3.12 yuklu olmalidir.
REM Bu betik:
REM   1. Sanal ortam olusturur (.venv)
REM   2. pip'i gunceller
REM   3. requirements.txt yukler
REM   4. Sistem kontrolunu calistirir
REM ============================================================

setlocal enabledelayedexpansion

cd /d "%~dp0\..\.."
echo.
echo ============================================================
echo   CODEGA AI - Windows Kurulumu
echo ============================================================
echo.

REM Python kontrolu
where python >nul 2>nul
if errorlevel 1 (
    echo [HATA] Python bulunamadi.
    echo Lutfen https://python.org adresinden Python 3.10+ yukleyin.
    echo "Add Python to PATH" secenegini isaretlemeyi unutmayin.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK] Python %PY_VER% bulundu.

REM Sanal ortam olustur
if exist ".venv" (
    echo [INFO] .venv zaten mevcut, atlaniyor.
) else (
    echo [INFO] Sanal ortam olusturuluyor...
    python -m venv .venv
    if errorlevel 1 (
        echo [HATA] Sanal ortam olusturulamadi.
        pause
        exit /b 1
    )
    echo [OK] .venv olusturuldu.
)

REM Aktive et
call .venv\Scripts\activate.bat

REM pip yukselt
echo [INFO] pip guncelleniyor...
python -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo [UYARI] pip guncellenemedi, devam ediliyor.
)

REM Bagimliliklar
echo [INFO] Bagimliliklar yukleniyor...
pip install -r requirements.txt
if errorlevel 1 (
    echo [HATA] Bagimliliklar yuklenemedi.
    pause
    exit /b 1
)
echo [OK] Bagimliliklar yuklendi.

REM Init
echo [INFO] Veri dizinleri olusturuluyor...
python launcher.py --init

REM Sistem kontrolu
echo.
echo [INFO] Sistem kontrolu calistiriliyor...
python launcher.py --check

echo.
echo ============================================================
echo   Kurulum tamamlandi.
echo.
echo   Baslatmak icin:
echo     .venv\Scripts\activate
echo     python launcher.py
echo ============================================================
echo.
pause
endlocal
