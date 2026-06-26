param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8NoBom($Path, $Content) {
  [System.IO.File]::WriteAllText((Resolve-Path $Path), $Content, $utf8NoBom)
}

$pkg = "apps\codegaai-desktop\package.json"
$check = "apps\codegaai-desktop\scripts\check.mjs"

$pkgContent = Get-Content $pkg -Raw
$pkgContent = $pkgContent -replace '"version"\s*:\s*"[0-9]+\.[0-9]+\.[0-9]+"', '"version":"' + $Version + '"'
Write-Utf8NoBom $pkg $pkgContent

$checkContent = Get-Content $check -Raw
$checkContent = $checkContent -replace 'pkg\.version !== "[0-9]+\.[0-9]+\.[0-9]+"', 'pkg.version !== "' + $Version + '"'
Write-Utf8NoBom $check $checkContent

Push-Location "apps\codegaai-desktop"
npm run check
Pop-Location

git add $pkg $check scripts/release.ps1
git commit -m "chore: release Phoenix v$Version"
git push origin main

git tag "v$Version"
git push origin "v$Version"

Write-Host "Phoenix release v$Version pushed." -ForegroundColor Green
