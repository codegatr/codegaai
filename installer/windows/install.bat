@echo off
REM ============================================================
REM CODEGA AI - Windows Kurulum Betiği (v0.2.1+)
REM ============================================================
REM Python 3.10, 3.11 veya 3.12 gereklidir.
REM 3.13+ desteklenmiyor (pywebview/pythonnet henuz wheel uretmedi).
REM Betik 'py launcher' ile uygun surumu otomatik bulur.
REM ============================================================

setlocal enabledelayedexpansion

cd /d "%~dp0\..\.."
echo.
echo ============================================================
echo   CODEGA AI - Windows Kurulumu
echo ============================================================
echo.

REM ---- Python 3.10-3.12 ara ----
set PY_CMD=
set PY_VER=

REM Once py launcher ile spesifik surumleri dene
for %%V in (3.12 3.11 3.10) do (
    if "!PY_CMD!"=="" (
        py -%%V --version >nul 2>nul
        if !errorlevel!==0 (
            set PY_CMD=py -%%V
            set PY_VER=%%V
            echo [OK] Python %%V bulundu (py launcher ile^).
            goto :py_found
        )
    )
)

REM py launcher yoksa, sistem python'unu kontrol et
where python >nul 2>nul
if !errorlevel!==0 (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set RAW_VER=%%v
    for /f "tokens=1,2 delims=." %%a in ("!RAW_VER!") do (
        set MAJOR=%%a
        set MINOR=%%b
    )
    if "!MAJOR!"=="3" (
        if !MINOR! GEQ 10 if !MINOR! LEQ 12 (
            set PY_CMD=python
            set PY_VER=!RAW_VER!
            echo [OK] Python !RAW_VER! bulundu.
            goto :py_found
        )
        if !MINOR! GEQ 13 (
            echo.
            echo [HATA] Python !RAW_VER! desteklenmiyor.
            echo.
            echo CODEGA AI Python 3.10, 3.11 veya 3.12 gerektirir.
            echo Sebep: pywebview'in 'pythonnet' bagimliligi 3.13+ icin
            echo henuz wheel yayinlamadi (kaynaktan derleme NuGet hatasi
            echo veriyor^).
            echo.
            echo Cozum: Python 3.12'yi YAN YANA kur ^(eski surumu silmene
            echo gerek yok^):
            echo.
            echo   https://www.python.org/downloads/release/python-3128/
            echo.
            echo Kurulumda "Add Python to PATH" kutucugunu isaretle ve
            echo "py launcher"in kurulu olduguna emin ol.
            echo Ardindan bu betigi yeniden calistir.
            echo.
            pause
            exit /b 1
        )
    )
)

echo.
echo [HATA] Python 3.10, 3.11 veya 3.12 bulunamadi.
echo.
echo Kurulum: https://www.python.org/downloads/release/python-3128/
echo "Add Python to PATH" secenegini isaretlemeyi unutmayin.
echo.
pause
exit /b 1

:py_found
echo.

REM ---- Sanal ortam ----
if exist ".venv" (
    REM Eski venv'in Python surumunu kontrol et
    if exist ".venv\Scripts\python.exe" (
        for /f "tokens=2" %%v in ('".venv\Scripts\python.exe" --version 2^>^&1') do set VENV_VER=%%v
        echo [INFO] Mevcut .venv: Python !VENV_VER!
        for /f "tokens=1,2 delims=." %%a in ("!VENV_VER!") do (
            set VMAJ=%%a
            set VMIN=%%b
        )
        if "!VMAJ!"=="3" (
            if !VMIN! LSS 10 (
                echo [UYARI] Eski venv eski Python kullaniyor, siliniyor...
                rmdir /s /q .venv
                goto :create_venv
            )
            if !VMIN! GTR 12 (
                echo [UYARI] Eski venv desteklenmeyen Python !VENV_VER! kullaniyor.
                echo         Siliniyor ve Python !PY_VER! ile yeniden olusturuluyor...
                rmdir /s /q .venv
                goto :create_venv
            )
        )
        echo [OK] .venv mevcut, kullaniliyor.
        goto :install_deps
    ) else (
        rmdir /s /q .venv
        goto :create_venv
    )
)

:create_venv
echo [INFO] Sanal ortam olusturuluyor (Python !PY_VER!)...
%PY_CMD% -m venv .venv
if errorlevel 1 (
    echo [HATA] Sanal ortam olusturulamadi.
    pause
    exit /b 1
)
echo [OK] .venv olusturuldu.

:install_deps
REM venv'in python.exe'sini kullan (activate gerekmez)
set VPY=.venv\Scripts\python.exe

echo [INFO] pip guncelleniyor...
%VPY% -m pip install --upgrade pip --quiet

echo [INFO] Bagimliliklar yukleniyor...
%VPY% -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [HATA] Bagimliliklar yuklenemedi.
    echo Detay icin yukaridaki cikti'ya bakin.
    pause
    exit /b 1
)
echo [OK] Bagimliliklar yuklendi.

echo [INFO] Veri dizinleri olusturuluyor...
%VPY% launcher.py --init

echo.
echo [INFO] Sistem kontrolu calistiriliyor...
%VPY% launcher.py --check

echo.
echo ============================================================
echo   Kurulum tamamlandi.
echo.
echo   Baslatmak icin asagidakilerden birini kullan:
echo.
echo   1) Masaustu penceresi (varsayilan):
echo        .venv\Scripts\python.exe launcher.py
echo.
echo   2) Sistem tarayicisinda:
echo        .venv\Scripts\python.exe launcher.py --browser
echo.
echo   3) Sadece backend (UI acmadan):
echo        .venv\Scripts\python.exe launcher.py --serve
echo ============================================================
echo.
pause
endlocal
