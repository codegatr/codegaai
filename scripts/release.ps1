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

function Run-Step($Name, $ScriptBlock) {
  Write-Host "\n==> $Name" -ForegroundColor Cyan
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

$pkg = "apps\codegaai-desktop\package.json"
$check = "apps\codegaai-desktop\scripts\check.mjs"

$existingTags = git tag --list "v$Version"
if ($existingTags -contains "v$Version") {
  throw "Tag v$Version already exists. Use a new version number."
}

git fetch origin --tags
$remoteTag = git ls-remote --tags origin "refs/tags/v$Version"
if ($remoteTag) {
  throw "Remote tag v$Version already exists. Use a new version number."
}

$pkgContent = Get-Content $pkg -Raw
$pkgReplacement = '"version":"' + $Version + '"'
$pkgContent = $pkgContent -replace '"version"\s*:\s*"[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?"', $pkgReplacement
Write-Utf8NoBom $pkg $pkgContent

$checkContent = Get-Content $check -Raw
$checkReplacement = 'pkg.version !== "' + $Version + '"'
$checkContent = $checkContent -replace 'pkg\.version !== "[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?"', $checkReplacement
Write-Utf8NoBom $check $checkContent

Push-Location "apps\codegaai-desktop"
try {
  Run-Step "npm run check" { npm run check }
} finally {
  Pop-Location
}

git add $pkg $check scripts/release.ps1 scripts/patch-electron-timeouts.ps1 apps/codegaai-desktop/src/renderer/index.html apps/codegaai-desktop/src/renderer/renderer-hotfix.js apps/codegaai-desktop/src/renderer/renderer.js apps/codegaai-desktop/src/shared/constants.js apps/codegaai-desktop/src/main/phoenix-core
$changes = git status --porcelain
if (-not $changes) {
  Write-Host "No release file changes to commit." -ForegroundColor Yellow
} else {
  Run-Step "git commit" { git commit -m "chore: release Phoenix v$Version" }
  Run-Step "git push" { git push origin main }
}

Run-Step "git tag" { git tag "v$Version" }
Run-Step "git push tag" { git push origin "v$Version" }

Write-Host "Phoenix release v$Version pushed. Check GitHub Actions for build/release assets." -ForegroundColor Green
