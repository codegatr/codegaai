$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8NoBom($Path, $Content) {
  [System.IO.File]::WriteAllText((Resolve-Path $Path), $Content, $utf8NoBom)
}

$renderer = "apps\codegaai-desktop\src\renderer\renderer.js"
$content = Get-Content $renderer -Raw

$content = $content -replace 'function sendMessageWithWatchdog\(text, options = \{\}, idleMs = 30000, hardMs = 30000\)', 'function sendMessageWithWatchdog(text, options = {}, idleMs = 90000, hardMs = 180000)'
$content = $content -replace '"Model uzun süre gerçek bir yanıt üretmedi; işlem durduruldu\. Daha hafif bir model seçip tekrar deneyebilirsin\."', '"Model uzun süre yanıt üretmedi; işlem güvenli şekilde durduruldu. Daha hafif bir model seçip tekrar deneyebilirsin."'
$content = $content -replace 'els\.modelPill\.textContent = String\(text\)\.replace\(/^Çalışma özeti:\\s\*/i, ""\)\.trim\(\);', 'els.modelPill.textContent = repairRendererMojibake(String(text)).replace(/^Çalışma özeti:\\s*/i, "").trim();'

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
    .replace(/ÅŸ/g, "ş");
}

'@

if ($content -notmatch 'function repairRendererMojibake') {
  $content = $content -replace 'function setChatWorkingStatus\(value\) \{', ($helper + 'function setChatWorkingStatus(value) {')
}

Write-Utf8NoBom $renderer $content
Write-Host "Watchdog stability patch applied." -ForegroundColor Green
