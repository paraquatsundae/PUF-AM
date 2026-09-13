#!/usr/bin/env node
/**
 * Cross-compile freenet-core (pinned in scripts/freenet-binaries.json) for
 * aarch64-linux-android and vendor it as libfreenet.so.
 *
 * Official GitHub releases ship `aarch64-unknown-linux-musl`, which is not
 * Android bionic. There is no APK/so asset as of v0.2.135 (checked 2026-09-12).
 * This script clones the pinned tag and builds the `freenet` bin with the NDK
 * clang. AGPL stays at the process boundary (`android:process=":freenet"`);
 * PUF-AM talks loopback WS only — never JNI into the WebView.
 *
 * Plans/FREENET_NETWORK_PACK.md Phase 3 · Plans/APK_FREENET_HOST.md Phase 2.
 *
 * Usage:
 *   node scripts/build-freenet-android.mjs
 *
 * Exit 0 only if vendor/freenet/android-arm64/libfreenet.so was written.
 * Exit 2 when the NDK / Rust Android target is missing, or cargo fails.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(readFileSync(path.join(REPO, 'scripts', 'freenet-binaries.json'), 'utf8'));
const PIN = String(MANIFEST.version || '0.2.135');
const TAG = String(MANIFEST.releaseTag || `v${PIN}`);
const TARGET = 'aarch64-linux-android';
const API = Number(process.env.PUF_FREENET_ANDROID_API || 24);
const VENDOR = path.join(REPO, 'vendor', 'freenet', 'android-arm64');
const SRC = process.env.PUF_FREENET_CORE_DIR?.trim()
  || path.join(REPO, 'tmp', `freenet-core-${PIN}`);
const OUT = path.join(VENDOR, 'libfreenet.so');

function which(name) {
  const r = spawnSync('sh', ['-c', `command -v ${JSON.stringify(name)}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function rustHasTarget() {
  const r = spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.includes(TARGET);
}

function ndkHome() {
  const env =
    process.env.ANDROID_NDK_HOME ||
    process.env.NDK_HOME ||
    process.env.ANDROID_NDK_ROOT ||
    '';
  if (env && existsSync(env)) return env;
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || '/home/george/android-sdk';
  const ndkRoot = path.join(sdk, 'ndk');
  if (!existsSync(ndkRoot)) return '';
  const versions = spawnSync('sh', ['-c', `ls -1 ${JSON.stringify(ndkRoot)} | sort -V`], {
    encoding: 'utf8',
  });
  const last = versions.stdout.trim().split('\n').filter(Boolean).pop();
  return last ? path.join(ndkRoot, last) : '';
}

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8', ...opts });
  return r.status === 0;
}

const rustc = which('rustc');
const cargo = which('cargo');
const git = which('git');
const ndk = ndkHome();
const hasNdk = Boolean(ndk && existsSync(ndk));

console.log(`Freenet Android build — pin ${PIN} (${TAG}), target ${TARGET}, API ${API}`);
console.log(`  rustc: ${rustc || '(missing)'}`);
console.log(`  cargo: ${cargo || '(missing)'}`);
console.log(`  git: ${git || '(missing)'}`);
console.log(`  rustup target ${TARGET}: ${rustHasTarget() ? 'installed' : 'missing'}`);
console.log(`  NDK: ${hasNdk ? ndk : '(missing — set ANDROID_NDK_HOME)'}`);
console.log(`  source: ${SRC}`);
console.log(`  vendor: ${path.relative(REPO, OUT)} (gitignored)`);

if (!cargo || !git || !hasNdk) {
  console.error('\nToolchain incomplete. Need cargo, git, and an Android NDK r26+.');
  process.exitCode = 2;
  process.exit();
}

function rustToolchainFile(dir) {
  const p = path.join(dir, 'rust-toolchain.toml');
  return existsSync(p) ? p : '';
}

function pinnedToolchain(dir) {
  const file = rustToolchainFile(dir);
  if (!file) return '';
  const text = readFileSync(file, 'utf8');
  const match = /channel\s*=\s*"([^"]+)"/.exec(text);
  return match?.[1] ?? '';
}

const prebuilt = path.join(ndk, 'toolchains', 'llvm', 'prebuilt', 'linux-x86_64');
const clang = path.join(prebuilt, 'bin', `aarch64-linux-android${API}-clang`);
const ar = path.join(prebuilt, 'bin', 'llvm-ar');
if (!existsSync(clang) || !existsSync(ar)) {
  console.error(`NDK clang/ar missing:\n  ${clang}\n  ${ar}`);
  process.exitCode = 2;
  process.exit();
}

if (!existsSync(path.join(SRC, 'Cargo.toml'))) {
  mkdirSync(path.dirname(SRC), { recursive: true });
  if (existsSync(SRC)) {
    console.error(`${SRC} exists but has no Cargo.toml`);
    process.exitCode = 2;
    process.exit();
  }
  if (!run('git', ['clone', '--depth', '1', '--branch', TAG, 'https://github.com/freenet/freenet-core.git', SRC])) {
    process.exitCode = 2;
    process.exit();
  }
}

const channel = pinnedToolchain(SRC);
if (channel) {
  console.log(`  rust-toolchain.toml channel: ${channel} (must have ${TARGET})`);
  if (!run('rustup', ['target', 'add', TARGET, '--toolchain', channel])) {
    process.exitCode = 2;
    process.exit();
  }
} else if (!rustHasTarget()) {
  if (!run('rustup', ['target', 'add', TARGET])) {
    process.exitCode = 2;
    process.exit();
  }
}

const targetDir = process.env.PUF_FREENET_ANDROID_TARGET_DIR?.trim()
  || path.join(REPO, 'tmp', 'freenet-android-target');
const cargoBin = path.join(targetDir, TARGET, 'release', 'freenet');
const env = {
  ...process.env,
  ANDROID_NDK_HOME: ndk,
  NDK_HOME: ndk,
  CC_aarch64_linux_android: clang,
  AR_aarch64_linux_android: ar,
  CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: clang,
  CARGO_TARGET_DIR: targetDir,
  CARGO_TERM_COLOR: 'always',
};

console.log('\nBuilding freenet (this takes several minutes)…');
const built = run(
  cargo,
  ['build', '--release', '--target', TARGET, '-p', 'freenet'],
  { cwd: SRC, env },
);

if (!built || !existsSync(cargoBin)) {
  console.error('\nAndroid cargo build failed or produced no `freenet` binary.');
  console.error('Do not ship a stub. The APK will keep failing clean: no android-arm64 binary.');
  process.exitCode = 2;
  process.exit();
}

mkdirSync(VENDOR, { recursive: true });
copyFileSync(cargoBin, OUT);
chmodSync(OUT, 0o755);
const bytes = readFileSync(OUT);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const stamp = {
  version: PIN,
  releaseTag: TAG,
  target: TARGET,
  api: API,
  status: 'workshop-built',
  source: 'built-from-pinned-tag',
  repository: MANIFEST.repository,
  fileName: 'libfreenet.so',
  sha256,
  bytes: bytes.length,
  ndk,
  rustc: spawnSync(rustc, ['--version'], { encoding: 'utf8' }).stdout.trim(),
  at: new Date().toISOString(),
};
writeFileSync(path.join(VENDOR, 'VENDOR.json'), `${JSON.stringify(stamp, null, 2)}\n`);
const licenseSrc = path.join(SRC, 'LICENSE.md');
if (existsSync(licenseSrc)) copyFileSync(licenseSrc, path.join(VENDOR, 'LICENSE.md'));

console.log(`\nWrote ${path.relative(REPO, OUT)} (${bytes.length} bytes, sha256 ${sha256})`);
console.log('The :freenet service execs this as libfreenet.so from nativeLibraryDir.');
process.exitCode = 0;
