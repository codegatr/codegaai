@echo off
cd /d D:\2-CODEGAAI\PROJE-KODU\codegaai
echo === alpha.23 Fix Push ===

echo [1/4] Pulling remote changes...
git pull --rebase origin main
if %errorlevel% neq 0 (
    echo PULL FAILED - aborting
    pause
    exit /b 1
)

echo [2/4] Pushing main branch...
git push origin main
if %errorlevel% neq 0 (
    echo PUSH FAILED
    pause
    exit /b 1
)

echo [3/4] Re-creating tag on latest commit...
git tag -d desktop-v6.0.0-alpha.23 2>nul
git tag desktop-v6.0.0-alpha.23

echo [4/4] Pushing tag...
git push origin desktop-v6.0.0-alpha.23 --force
if %errorlevel% neq 0 (
    echo TAG PUSH FAILED
    pause
    exit /b 1
)

echo === Done! GitHub Actions build starting. ===
pause
