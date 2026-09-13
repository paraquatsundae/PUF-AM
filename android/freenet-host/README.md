# Android Freenet host

**Experimental.** Firebase Auth + invite PIN remains the shipping path.

Phase 3 of [`Plans/FREENET_NETWORK_PACK.md`](../../Plans/FREENET_NETWORK_PACK.md). Isolated process shape: [`Plans/APK_FREENET_HOST.md`](../../Plans/APK_FREENET_HOST.md).

## What this slice does

- Capacitor plugin `FreenetHost` (`start` / `stop` / `status` / `attach`) in the WebView process.
- Optional `FreenetNodeService` in `android:process=":freenet"` with a foreground notification.
- **Product path:** start the in-APK `android-arm64` node in `:freenet` when a Freenet farm is open / the pack is enabled. **Attach-if-port-taken** if Freenet Android Node (or any node) already owns `127.0.0.1:7509`. The page PUTs with `BrowserFreenetPutClient`. No JNI into their APK or into our WebView.
- **Binary:** official freenet-core releases have no Android asset. Build the pin with `npm run android:vendor:freenet`. Without the so the service reports `no android-arm64 binary` and does not crash.

## Build a binary (spike)

```bash
node scripts/build-freenet-android.mjs
```

Exits **2** unless NDK + `aarch64-linux-android` Rust target are present **and** you have already produced a binary. If a build succeeds on this machine, put it in `vendor/freenet/android-arm64/` (gitignored; do not commit ~50 MB). Prior art: [manikmakki/freenet-android-node](https://github.com/manikmakki/freenet-android-node) (AGPL). PUF-AM keeps AGPL at the process boundary — WS to `127.0.0.1:7509` only.

## Manifest pin

`scripts/freenet-binaries.json` → `platforms.android-arm64.status` is `workshop-built` (official GitHub still has no Android asset; so is gitignored).
