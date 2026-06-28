@echo off
cd /d D:\2-CODEGAAI\PROJE-KODU\codegaai
echo === alpha.23 Clean Push ===

echo [1] Fetching remote...
git fetch origin main

echo [2] Deleting wrong remote tag...
git push origin --delete desktop-v6.0.0-alpha.23 2>nul

echo [3] Resetting to remote HEAD (alpha.22)...
git reset --hard origin/main

echo [4] Applying alpha.23 changes from staging...
xcopy /Y /S "_alpha23_staging\*" "." 

echo [5] Adding public_html (new directory)...
git add public_html\

echo [6] Staging alpha.23 files...
git add apps\codegaai-desktop\package.json
git add apps\codegaai-desktop\scripts\check.mjs
git add apps\codegaai-desktop\src\main\agent\settings-store.js
git add apps\codegaai-desktop\src\renderer\styles.css
git add apps\codegaai-desktop\src\renderer\index.html
git add apps\codegaai-desktop\src\renderer\renderer.js
git add apps\codegaai-desktop\src\main\preload.js
git add apps\codegaai-desktop\src\main\main.js

echo [7] Committing...
git commit -m "release: v6.0.0-alpha.23"

echo [8] Tagging...
git tag -d desktop-v6.0.0-alpha.23 2>nul
git tag desktop-v6.0.0-alpha.23

echo [9] Pushing...
git push origin main
git push origin desktop-v6.0.0-alpha.23

echo [10] Cleaning up staging folder...
rmdir /S /Q _alpha23_staging

echo === Done! ===
pause
