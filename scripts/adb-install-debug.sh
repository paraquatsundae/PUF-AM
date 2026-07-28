#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  echo "No APK at $APK — build with: cd android && ./gradlew assembleDebug" >&2
  exit 1
fi
if ! adb devices | awk 'NR>1 && $2=="device"{ok=1} END{exit ok?0:1}'; then
  echo "No adb device. Pair/connect wireless debugging, then: adb connect HOST:PORT" >&2
  exit 1
fi
adb install -r "$APK"
echo "Installed. Ensure CAP_SERVER_URL pointed at this PC before last cap sync."
