# patch-electron-timeouts.ps1
# NOT: renderer-hotfix.js artik index.html'e kaynak kodda eklenmis durumda.
# Bu script yalnizca timeout degerlerini gunceller; encoding degisikligi YAPMAZ.
# Get-Content her zaman -Encoding UTF8 ile kullanilmali - aksi halde Turkce
# karakterler bozulur (mojibake). Bu scriptin onceki surumu bu hataya sebep oluyordu.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8NoBom($Path, $Content) {
  [System.IO.File]::WriteAllText((Resolve-Path $Path), $Content, $utf8NoBom)
}

function Patch-TextFile($Path, [ScriptBlock]$Patch) {
  if (-not (Test-Path $Path)) { return }
  # KRITIK: -Encoding UTF8 olmadan Get-Content sistem encoding'ini (cp1252) kullanir
  # ve Turkce karakterleri bozar. Her zaman UTF8 belirt.
  $content = Get-Content $Path -Raw -Encoding UTF8
  $patched = & $Patch $content
  Write-Utf8NoBom $Path $patched
}

$renderer = "apps\codegaai-desktop\src\renderer\renderer.js"
$constants = "apps\codegaai-desktop\src\shared\constants.js"

# Sadece timeout degerlerini guncelle - string literal degistirme YOK
Patch-TextFile $renderer {
  param($content)
  $content = $content -replace 'function sendMessageWithWatchdog\(text, options = \{\}, idleMs = \d+, hardMs = \d+\)', 'function sendMessageWithWatchdog(text, options = {}, idleMs = 300000, hardMs = 600000)'
  return $content
}

# NOT: index.html artik kaynak kodda renderer-hotfix.js iceriyor, patch gerekmez.
# NOT: OLLAMA_CHAT_TIMEOUT_MS 180s olarak kalmali (600s cok fazla).

Write-Host "Timeout patch applied: renderer idle=300s, hard=600s." -ForegroundColor Green
Write-Host "renderer-hotfix.js zaten index.html'de tanimli - ayri inject gerekmez." -ForegroundColor Cyan
