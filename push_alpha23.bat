@echo off
cd /d D:\2-CODEGAAI\PROJE-KODU\codegaai
echo === alpha.23 Release Push ===
git add apps/codegaai-desktop/package.json
git add apps/codegaai-desktop/scripts/check.mjs
git add apps/codegaai-desktop/src/main/agent/settings-store.js
git add apps/codegaai-desktop/src/renderer/styles.css
git add apps/codegaai-desktop/src/renderer/index.html
git add apps/codegaai-desktop/src/renderer/renderer.js
git add apps/codegaai-desktop/src/main/preload.js
git add apps/codegaai-desktop/src/main/main.js
git add public_html/
git commit -m "release: v6.0.0-alpha.23 — Genel Ayarlar fix + Sistem Bildirimleri + Federe Ag fix"
git tag desktop-v6.0.0-alpha.23
git push origin main --tags
echo === Done! Check GitHub Actions for the build. ===
pause
