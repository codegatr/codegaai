<#
.SYNOPSIS
  Transaction-korumalı desktop release pipeline'ı.

.DESCRIPTION
  Sürümü TEK atomik işlem gibi günceller. Sürümün Single Source of Truth'u
  apps\codegaai-desktop\package.json'dır; check.mjs guard'ı onunla senkron
  tutulur. Bu iki dosya tek bir "transaction" olarak ele alınır:

    1) Değişiklikten ÖNCE yedek alınır (rollback için).
    2) Dosyalar güncellenir, `npm run check` ile doğrulanır, commit/push/tag yapılır.
    3) Herhangi bir adım patlarsa catch bloğu yarım kalan dosya değişikliklerini
       yedekten GERİ YÜKLER (henüz commit alınmadıysa).
    4) finally bloğu kilit dosyasını HER KOŞULDA temizler.

  NOT: Repo'da `inc\version.php` yoktur; eski şablonlardaki o yol bu projede
  geçerli değildir. Sürümün gerçek kaynağı package.json'dır.

.PARAMETER Version
  Semver sürüm (örn. 6.0.0-alpha.58). Başına prefix eklenmez; tag "desktop-v$Version" olur.

.PARAMETER PhpVersionFile
  (Opsiyonel) PHP sürüm/sabit dosyası. Verilmezse bilinen adaylar denenir
  (inc\version.php, public_html\inc\version.php). Dosya yoksa ilgili kontrol
  no-op'tur; varsa el-ile sabitlenmiş kritik sabitleri ve SemVer uyumunu denetler.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?$')]
  [string]$Version,

  [string]$PhpVersionFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$lockFile  = Join-Path $repoRoot ".release.lock"
$releaseTag = "desktop-v$Version"

# Atomik küme — sürüm bu iki dosyada birlikte güncellenir.
$pkg     = Join-Path $repoRoot "apps\codegaai-desktop\package.json"
$check   = Join-Path $repoRoot "apps\codegaai-desktop\scripts\check.mjs"
$targets = @($pkg, $check)

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Invoke-Step {
  param([string]$Name, [scriptblock]$Script)
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Script
  if ($LASTEXITCODE -ne 0) {
    throw "$Name başarısız (exit $LASTEXITCODE)"
  }
}

# Bir PHP define('NAME', '...') sabitinin DEĞERİNİ döndürür (yoksa $null).
function Get-PhpDefineValue {
  param([string]$Content, [string]$Name)
  $pattern = "define\(\s*['""]" + [regex]::Escape($Name) + "['""]\s*,\s*['""]?([^'"")]+?)['""]?\s*\)"
  $m = [regex]::Match($Content, $pattern)
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return $null
}

# [Soru 10] PHP sürüm/sabit bütünlüğü:
#   (a) Kritik dinamik sabitlerin (TOPLAM_MODUL_SAYISI) el-ile statik sayıya
#       gömülmesini regex ile yakalar → Fail-Fast.
#   (b) PHP VERSION/APP_VERSION ile manifest.json SemVer uyumunu denetler.
# Dosya yoksa no-op (repo'da henüz version.php yok; ileride eklenince zorlar).
function Test-PhpVersionIntegrity {
  param([string]$RepoRoot, [string]$ManifestPath, [string[]]$Candidates)
  foreach ($rel in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($rel)) { continue }
    $path = if ([System.IO.Path]::IsPathRooted($rel)) { $rel } else { Join-Path $RepoRoot $rel }
    if (-not (Test-Path $path)) { continue }

    Write-Host "==> PHP bütünlük denetimi: $rel" -ForegroundColor Cyan
    $content = Get-Content $path -Raw -Encoding UTF8

    # (a) Fail-Fast: dinamik fonksiyon yerine elle gömülmüş sayı.
    if ([regex]::IsMatch($content, "define\(\s*['""]TOPLAM_MODUL_SAYISI['""]\s*,\s*[0-9]+\s*\)")) {
      throw "Fail-Fast: $rel içinde TOPLAM_MODUL_SAYISI elle statik sayı olarak tanımlanmış. Dinamik bir kaynak (örn. count(get_modules())) kullanın."
    }

    # (b) SemVer tutarlılığı: PHP sürümü ile manifest.json eşleşmeli.
    $phpVer = Get-PhpDefineValue -Content $content -Name "VERSION"
    if (-not $phpVer) { $phpVer = Get-PhpDefineValue -Content $content -Name "APP_VERSION" }
    if ($phpVer -and (Test-Path $ManifestPath)) {
      $manifest = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($manifest.version -and ($manifest.version -ne $phpVer)) {
        throw "SemVer uyumsuzluğu: manifest.json ($($manifest.version)) ≠ $rel ($phpVer). Rollback tetikleniyor."
      }
    }
  }
}

# Defensive: transaction durum bayrakları (her şey try'dan ÖNCE init edilir).
$lockCreated = $false
$committed   = $false
$backups     = @{}

# --- Kilit: eşzamanlı ikinci bir release'i engelle ---
if (Test-Path $lockFile) {
  throw "Bir release zaten çalışıyor gibi görünüyor (kilit: $lockFile). Süreç bittiyse dosyayı silip tekrar deneyin."
}

try {
  Set-Content -Path $lockFile -Value "pid=$PID; version=$Version; at=$(Get-Date -Format o)" -Encoding ascii
  $lockCreated = $true

  # --- Pre-flight: tag çakışması (yerel + uzak) ---
  $localTags = git tag --list $releaseTag
  if ($localTags -contains $releaseTag) {
    throw "Tag $releaseTag yerelde zaten var. Yeni bir sürüm numarası kullanın."
  }
  Invoke-Step "git fetch --tags" { git fetch origin --tags }
  $remoteTag = git ls-remote --tags origin "refs/tags/$releaseTag"
  if ($remoteTag) {
    throw "Uzak tag $releaseTag zaten var. Yeni bir sürüm numarası kullanın."
  }

  # --- Yedek al (rollback kaynağı) — DEĞİŞİKLİKTEN ÖNCE ---
  foreach ($f in $targets) {
    if (-not (Test-Path $f)) { throw "Hedef dosya bulunamadı: $f" }
    # KRİTİK: -Encoding UTF8 olmadan Get-Content cp1252 kullanır ve TR karakterleri bozar.
    $backups[$f] = Get-Content $f -Raw -Encoding UTF8
  }

  # --- Atomik güncelleme (in-memory yedekten türeterek) ---
  $pkgContent = $backups[$pkg] -replace `
    '"version"\s*:\s*"[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?"', `
    ('"version": "' + $Version + '"')
  Write-Utf8NoBom $pkg $pkgContent

  $checkContent = $backups[$check] -replace `
    'pkg\.version !== "[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?"', `
    ('pkg.version !== "' + $Version + '"')
  Write-Utf8NoBom $check $checkContent

  # --- [Soru 10] PHP regex + SemVer fail-fast (yazımdan SONRA: uyumsuzlukta
  #     catch bloğu version dosyalarını yedekten geri yükler = gerçek rollback) ---
  $manifestPath = Join-Path $repoRoot "manifest.json"
  $phpCandidates = if ([string]::IsNullOrWhiteSpace($PhpVersionFile)) {
    @("inc\version.php", "public_html\inc\version.php")
  } else {
    @($PhpVersionFile)
  }
  Test-PhpVersionIntegrity -RepoRoot $repoRoot -ManifestPath $manifestPath -Candidates $phpCandidates

  # --- Doğrula: test:ci başarısızsa catch rollback yapar (henüz commit yok) ---
  Push-Location "apps\codegaai-desktop"
  try {
    Invoke-Step "npm run test:ci" { npm run test:ci }
  } finally {
    Pop-Location
  }

  # --- Commit + push + tag ---
  Invoke-Step "git add" { git add -- $pkg $check }
  $pending = git status --porcelain -- $pkg $check
  if ([string]::IsNullOrWhiteSpace($pending)) {
    Write-Host "Sürüm dosyalarında değişiklik yok; commit atlanıyor (yalnız tag atılacak)." -ForegroundColor Yellow
  } else {
    Invoke-Step "git commit" { git commit -m "chore: release desktop v$Version" }
    $committed = $true
    Invoke-Step "git push"   { git push origin HEAD }
  }

  Invoke-Step "git tag"      { git tag $releaseTag }
  Invoke-Step "git push tag" { git push origin $releaseTag }

  Write-Host "✅ Desktop release $releaseTag gönderildi. Asset'ler için GitHub Actions'a bakın." -ForegroundColor Green
}
catch {
  Write-Host "❌ HATA: $($_.Exception.Message)" -ForegroundColor Red

  if (-not $committed -and $backups.Count -gt 0) {
    Write-Host "↩ Rollback: dosyalar yedeklerinden geri yükleniyor..." -ForegroundColor Yellow
    foreach ($f in $backups.Keys) {
      try {
        Write-Utf8NoBom $f $backups[$f]
        Write-Host "   geri yüklendi: $f" -ForegroundColor DarkYellow
      } catch {
        Write-Host "   GERİ YÜKLENEMEDİ: $f → $($_.Exception.Message)" -ForegroundColor Red
      }
    }
  } elseif ($committed) {
    # Commit alındıktan sonraki bir hatada (push/tag) çalışma ağacını yıkıcı
    # git reset ile bozmayız; durumu kullanıcıya bırakırız.
    Write-Host "⚠ Commit zaten alınmıştı; otomatik git reset YAPILMAZ. Durumu manuel inceleyin (git log / git push)." -ForegroundColor Yellow
  }

  exit 1
}
finally {
  # Kilit HER KOŞULDA (başarı, hata, hatta erken çıkış) temizlenir.
  if ($lockCreated -and (Test-Path $lockFile)) {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    Write-Host "🔓 Release kilidi temizlendi." -ForegroundColor DarkGray
  }
}
