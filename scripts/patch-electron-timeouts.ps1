$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8NoBom($Path, $Content) {
  [System.IO.File]::WriteAllText((Resolve-Path $Path), $Content, $utf8NoBom)
}

function Patch-TextFile($Path, [ScriptBlock]$Patch) {
  if (-not (Test-Path $Path)) { return }
  $content = Get-Content $Path -Raw
  $patched = & $Patch $content
  Write-Utf8NoBom $Path $patched
}

$renderer = "apps\codegaai-desktop\src\renderer\renderer.js"
$index = "apps\codegaai-desktop\src\renderer\index.html"
$constants = "apps\codegaai-desktop\src\shared\constants.js"

Patch-TextFile $renderer {
  param($content)
  $content = $content -replace 'function sendMessageWithWatchdog\(text, options = \{\}, idleMs = \d+, hardMs = \d+\)', 'function sendMessageWithWatchdog(text, options = {}, idleMs = 300000, hardMs = 600000)'
  $content = $content -replace 'Model uzun süre gerçek bir yanıt üretmedi; işlem durduruldu\. Daha hafif bir model seçip tekrar deneyebilirsin\.', 'Model uzun süre yanıt üretmedi; işlem güvenli şekilde durduruldu. Daha hafif bir model seçip tekrar deneyebilirsin.'
  $content = $content -replace 'Yanıt \$\{Math\.round\(hardMs / 1000\)\} saniyelik üst süreyi aştı ve durduruldu\. Modeli veya ağı kontrol edip tekrar deneyebilirsin\.', 'Yanıt ${Math.round(hardMs / 1000)} saniyelik üst süreyi aştı. Yerel model hâlâ cevap üretmiyorsa işlem güvenli şekilde durduruldu.'
  return $content
}

Patch-TextFile $index {
  param($content)
  if ($content -notmatch 'renderer-hotfix\.js') {
    $content = $content -replace '<script src="\./renderer\.js"></script>', '<script src="./renderer-hotfix.js"></script>' + "`n" + '    <script src="./renderer.js"></script>'
  }
  return $content
}

Patch-TextFile $constants {
  param($content)
  $content = $content -replace 'const OLLAMA_CHAT_TIMEOUT_MS = \d+ \* 1000;', 'const OLLAMA_CHAT_TIMEOUT_MS = 600 * 1000;'
  return $content
}

Write-Host "Emergency hotfix applied: renderer idle=300s, hard=600s, Ollama=600s, UTF-8 recovery script injected." -ForegroundColor Green
