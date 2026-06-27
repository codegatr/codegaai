# patch-watchdog-stability.ps1
# ARTIK GEREKSİZ: repairRendererMojibake renderer.js'e kaynak kodda eklendi,
# renderer-hotfix.js index.html'e kalici olarak eklendi.
# Bu script yalnizca eski surumlerle uyumluluk icin korunuyor.
# CALISTIRMA - kaynak dosyalari bozabilir.
#
# ONEMLI DERS: Get-Content -Raw encoding belirtmeden calistirilirsa
# PowerShell sistem default encoding'ini (Windows'ta cp1252) kullanir.
# Bu Turkce karakterlerin mojibake'e donusmesine yol acar.
# Her zaman: Get-Content $path -Raw -Encoding UTF8

$ErrorActionPreference = "Stop"
Write-Host "Bu script artik gereksiz - tum duzeltmeler kaynak kodda yapildi." -ForegroundColor Yellow
Write-Host "renderer-hotfix.js: index.html'de kalici olarak tanimli." -ForegroundColor Cyan
Write-Host "repairRendererMojibake: renderer.js'de kaynak kodda mevcut." -ForegroundColor Cyan
