#!/usr/bin/env node
/**
 * Spike: cross-compile freenet-core (pinned in scripts/freenet-binaries.json)
 * for aarch64-linux-android.
 *
 * Official GitHub releases ship `aarch64-unknown-linux-musl`, which is not
 * Android bionic. There is no APK/so asset. Prior art:
 * https://github.com/manikmakki/freenet-android-node (AGPL-3.0 JNI cdylib).
 * PUF-AM keeps AGPL at the process boundary (`android:process=":freenet"`);
 * this script would vendor a binary under `vendor/freenet/android-arm64/`
 * (gitignored) for that process to exec or load — never JNI into the WebView.
 *
 * Plans/FREENET_NETWORK_PACK.md Phase 3 · Plans/APK_FREENET_HOST.md Phase 2.
 *
 * Usage:
 *   node scripts/build-freenet-android.mjs
 *
 * Exit 2 when the NDK or the Rust Android target is missing (the usual case).
 * Exit 0 only if a binary was written to vendor/freenet/android-arm64/.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(REPO, 'vendor', 'freenet', 'android-arm64');
const PIN = '0.2.135';
const TARGET = 'aarch64-linux-android';

function which(name) {
  const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function rustHasTarget() {
  const r = spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.includes(TARGET);
}

function ndkHome() {
  return (
    process.env.ANDROID_NDK_HOME ||
    process.env.NDK_HOME ||
    process.env.ANDROID_NDK_ROOT ||
    ''
  );
}

const rustc = which('rustc');
const cargo = which('cargo');
const ndk = ndkHome();
const hasTarget = rustc && rustHasTarget();
const hasNdk = ndk && existsSync(ndk);

console.log(`Freenet Android spike — pin ${PIN}, target ${TARGET}`);
console.log(`  rustc: ${rustc || '(missing)'}`);
console.log(`  cargo: ${cargo || '(missing)'}`);
console.log(`  rustup target ${TARGET}: ${hasTarget ? 'installed' : 'missing'}`);
console.log(`  NDK: ${hasNdk ? ndk : '(missing — set ANDROID_NDK_HOME)'}`);
console.log(`  vendor: ${path.relative(REPO, VENDOR)} (gitignored)`);
console.log('');
console.log('Toolchain (when you want a real build):');
console.log('  1. Android NDK r26+ (clang for aarch64-linux-android).');
console.log('  2. rustup target add aarch64-linux-android');
console.log(`  3. Clone freenet-core @ v${PIN} (AGPL-3.0).`);
console.log('  4. cargo build --release --target aarch64-linux-android -p freenet');
console.log('     (expect missing crates / JNI glue — see manikmakki/freenet-android-node).');
console.log('  5. Copy the binary to vendor/freenet/android-arm64/libfreenet.so');
console.log('     Do not commit it (~50 MB). The :freenet service looks there / jniLibs.');
console.log('');
console.log('Until a binary exists, the APK attaches to Freenet Android Node on 127.0.0.1:7509.');

if (!hasNdk || !hasTarget || !cargo) {
  process.exitCode = 2;
  process.exit();
}

mkdirSync(VENDOR, { recursive: true });
const stamp = path.join(VENDOR, 'SPIKE.json');
if (!existsSync(path.join(VENDOR, 'libfreenet.so')) && !existsSync(path.join(VENDOR, 'freenet'))) {
  writeFileSync(
    stamp,
    `${JSON.stringify(
      {
        version: PIN,
        target: TARGET,
        status: 'toolchain-present-no-binary',
        note: 'NDK and Rust Android target are here; a successful cargo build was not run by this stub.',
        at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nToolchain looks present. This stub does not clone or build freenet-core.`);
  console.log(`Wrote ${path.relative(REPO, stamp)}. Run the cargo steps above, then point the service at the so.`);
  process.exitCode = 2;
}
