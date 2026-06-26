$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8NoBom($Path, $Content) {
  [System.IO.File]::WriteAllText((Resolve-Path $Path), $Content, $utf8NoBom)
}

$renderer = "apps\codegaai-desktop\src\renderer\renderer.js"
$constants = "apps\codegaai-desktop\src\shared\constants.js"

if (Test-Path $renderer) {
  $content = Get-Content $renderer -Raw
  $content = $content -replace 'function sendMessageWithWatchdog\(text, options = \{\}, idleMs = \d+, hardMs = \d+\)', 'function sendMessageWithWatchdog(text, options = {}, idleMs = 90000, hardMs = 180000)'
  $content = $content -replace '"Model uzun süre gerçek bir yanıt üretmedi; işlem durduruldu\. Daha hafif bir model seçip tekrar deneyebilirsin\."', '"Model uzun süre yanıt üretmedi; işlem güvenli şekilde durduruldu. Daha hafif bir model seçip tekrar deneyebilirsin."'
  $content = $content -replace '`Yanıt \$\{Math\.round\(hardMs / 1000\)\} saniyelik üst süreyi aştı ve durduruldu\. Modeli veya ağı kontrol edip tekrar deneyebilirsin\.`', '`Yanıt ${Math.round(hardMs / 1000)} saniyelik üst süreyi aştı. Yerel model hâlâ cevap üretmiyorsa işlem güvenli şekilde durduruldu.`'
  Write-Utf8NoBom $renderer $content
}

if (Test-Path $constants) {
  $content = Get-Content $constants -Raw
  $content = $content -replace 'const OLLAMA_CHAT_TIMEOUT_MS = \d+ \* 1000;', 'const OLLAMA_CHAT_TIMEOUT_MS = 180 * 1000;'
  Write-Utf8NoBom $constants $content
}

Write-Host "Electron/Ollama timeout patch applied: idle=90s, hard=180s, ollamaChat=180s." -ForegroundColor Green
