# Resize PUFOM master icon into Android mipmap densities + public favicon assets.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$masterCandidates = @(
  (Join-Path $root "assets\pufom-apk-icon-master.png"),
  (Join-Path $root "PUFom_icon.png"),
  (Join-Path $root "public\pufom-icon.png"),
  (Join-Path $env:USERPROFILE ".cursor\projects\c-Projects-Walnut-farm-manager\assets\pufom-apk-icon-master.png")
)
$master = $masterCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $master) { Write-Error "pufom-apk-icon-master.png not found" }

Copy-Item -Force $master (Join-Path $root "public\pufom-icon.png")

function Resize-Png([string]$srcPath, [string]$destPath, [int]$size) {
  $src = [System.Drawing.Image]::FromFile($srcPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $size, $size)
    $dir = Split-Path $destPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
  } finally {
    $src.Dispose()
  }
}

# Legacy launcher sizes (dp → px)
$launcher = @{
  "mipmap-mdpi"    = 48
  "mipmap-hdpi"    = 72
  "mipmap-xhdpi"   = 96
  "mipmap-xxhdpi"  = 144
  "mipmap-xxxhdpi" = 192
}
# Adaptive foreground (108dp)
$foreground = @{
  "mipmap-mdpi"    = 108
  "mipmap-hdpi"    = 162
  "mipmap-xhdpi"   = 216
  "mipmap-xxhdpi"  = 324
  "mipmap-xxxhdpi" = 432
}

$res = Join-Path $root "android\app\src\main\res"
foreach ($kv in $launcher.GetEnumerator()) {
  $dir = Join-Path $res $kv.Key
  Resize-Png $master (Join-Path $dir "ic_launcher.png") $kv.Value
  Resize-Png $master (Join-Path $dir "ic_launcher_round.png") $kv.Value
}
foreach ($kv in $foreground.GetEnumerator()) {
  $dir = Join-Path $res $kv.Key
  Resize-Png $master (Join-Path $dir "ic_launcher_foreground.png") $kv.Value
}

# Web favicon / PWA-ish sizes
Resize-Png $master (Join-Path $root "public\favicon-192.png") 192
Resize-Png $master (Join-Path $root "public\apple-touch-icon.png") 180

Write-Host "Installed PUFOM icons from $master"
