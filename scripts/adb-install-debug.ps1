# Install the latest debug APK. Optional: adb connect HOST:PORT first for wireless.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$apk = "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) {
  Write-Error "No APK at $apk — run: cd android; .\gradlew.bat assembleDebug"
}
$devices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
if (-not $devices) {
  Write-Host "No adb device. On the tablet: Developer options → Wireless debugging → Pair/Connect,"
  Write-Host "then: adb connect <ip>:<port>"
  Write-Host "Or plug USB with USB debugging on."
  exit 1
}
adb install -r $apk
Write-Host "Installed. App loads http://192.168.1.168:3000 when CAP_SERVER_URL was synced — keep npm run dev running."
Write-Host "Allow Location when prompted for the blue you-are-here dot."
