# Android Freenet host

**Experimental.** Firebase Auth + invite PIN remains the shipping path.

Phase 3 of [`Plans/FREENET_NETWORK_PACK.md`](../../Plans/FREENET_NETWORK_PACK.md). Isolated process shape: [`Plans/APK_FREENET_HOST.md`](../../Plans/APK_FREENET_HOST.md).

## What this slice does

- Capacitor plugin `FreenetHost` (`start` / `stop` / `status` / `attach`) in the WebView process.
- Optional `FreenetNodeService` in `android:process=":freenet"` with a foreground notification.
- **Product path today:** attach to **Freenet Android Node** (third-party APK) on `127.0.0.1:7509`. The page PUTs with `BrowserFreenetPutClient`. No JNI into their APK or into our WebView.
- **Later path:** an `android-arm64` `libfreenet.so` in this process. Official freenet-core releases have no Android asset (`aarch64-unknown-linux-musl` is not bionic).

## Build a binary (spike)

```bash
node scripts/build-freenet-android.mjs
```

Exits **2** unless NDK + `aarch64-linux-android` Rust target are present **and** you have already produced a binary. If a build succeeds on this machine, put it in `vendor/freenet/android-arm64/` (gitignored; do not commit ~50 MB). Prior art: [manikmakki/freenet-android-node](https://github.com/manikmakki/freenet-android-node) (AGPL). PUF-AM keeps AGPL at the process boundary — WS to `127.0.0.1:7509` only.

## Manifest pin

`scripts/freenet-binaries.json` → `platforms.android-arm64.status` is `missing` until an official or workshop-built so exists.
