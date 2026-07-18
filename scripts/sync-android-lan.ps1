# Sync Capacitor Android to load the live Express/Vite app from this PC's Wi‑Fi IP.
# Requires: npm run dev already running on port 3000; phone/tablet on the same Wi‑Fi.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "172.1*" -and
    $_.IPAddress -notlike "172.2*" -and
    $_.IPAddress -notlike "172.3*" -and
    $_.InterfaceAlias -match "Wi-?Fi|Ethernet|LAN"
  } |
  Sort-Object { if ($_.InterfaceAlias -match "Wi-?Fi") { 0 } else { 1 } } |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $ip) {
  Write-Error "No LAN IPv4 found. Connect Wi‑Fi/Ethernet and retry."
}

$url = "http://${ip}:3000"
Write-Host "CAP_SERVER_URL=$url"
try {
  $probe = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 4
  Write-Host "Health check: $($probe.StatusCode)"
} catch {
  Write-Warning "Could not reach $url/api/health — start 'npm run dev' first, then re-run this script."
}

$env:CAP_SERVER_URL = $url
npx cap sync android
Write-Host ""
Write-Host "Next: npm run open:android  → Run on a physical device (same Wi‑Fi)."
Write-Host "Phone browser (no APK): $url"
