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
$constants = "apps\codegaai-desktop\src\shared\constants.js"

Patch-TextFile $renderer {
  param($content)

  $content = $content -replace 'function sendMessageWithWatchdog\(text, options = \{\}, idleMs = \d+, hardMs = \d+\)', 'function sendMessageWithWatchdog(text, options = {}, idleMs = 90000, hardMs = 180000)'
  $content = $content -replace 'Model uzun süre gerçek bir yanıt üretmedi; işlem durduruldu\. Daha hafif bir model seçip tekrar deneyebilirsin\.', 'Model uzun süre yanıt üretmedi; işlem güvenli şekilde durduruldu. Daha hafif bir model seçip tekrar deneyebilirsin.'
  $content = $content -replace 'Yanıt \$\{Math\.round\(hardMs / 1000\)\} saniyelik üst süreyi aştı ve durduruldu\. Modeli veya ağı kontrol edip tekrar deneyebilirsin\.', 'Yanıt ${Math.round(hardMs / 1000)} saniyelik üst süreyi aştı. Yerel model hâlâ cevap üretmiyorsa işlem güvenli şekilde durduruldu.'

  $helper = @'
function repairRendererMojibake(value) {
  return String(value || "")
    .replace(/Ã‡/g, "Ç")
    .replace(/Ã§/g, "ç")
    .replace(/Ã–/g, "Ö")
    .replace(/Ã¶/g, "ö")
    .replace(/Ãœ/g, "Ü")
    .replace(/Ã¼/g, "ü")
    .replace(/Ä°/g, "İ")
    .replace(/Ä±/g, "ı")
    .replace(/Äž/g, "Ğ")
    .replace(/ÄŸ/g, "ğ")
    .replace(/Åž/g, "Ş")
    .replace(/ÅŸ/g, "ş")
    .replace(/â€™/g, "’")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—");
}

'@

  if ($content -notmatch 'function repairRendererMojibake') {
    $content = $content -replace 'function escapeHtml\(value\) \{', ($helper + 'function escapeHtml(value) {')
  }

  $content = $content -replace 'function escapeHtml\(value\) \{\s*return String\(value\)', 'function escapeHtml(value) {
  return repairRendererMojibake(String(value))'
  $content = $content -replace 'const original = String\(value \|\| ""\)\.trim\(\);', 'const original = repairRendererMojibake(value).trim();'
  $content = $content -replace 'els\.modelPill\.textContent = String\(text\)\.replace', 'els.modelPill.textContent = repairRendererMojibake(text).replace'
  return $content
}

Patch-TextFile $constants {
  param($content)
  $content = $content -replace 'const OLLAMA_CHAT_TIMEOUT_MS = \d+ \* 1000;', 'const OLLAMA_CHAT_TIMEOUT_MS = 180 * 1000;'
  return $content
}

Write-Host "Emergency hotfix applied: renderer timeout 90/180s, Ollama 180s, renderer mojibake repair." -ForegroundColor Green
