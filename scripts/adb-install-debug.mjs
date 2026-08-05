/**
 * Install the debug APK on whatever tablet adb can see.
 *
 * Cross-platform sibling of `adb-install-debug.ps1` / `.sh`, so `npm run
 * apk:install` means the same thing on the Fedora build box and the Windows one.
 * Plan: `Plans/APK_FREENET_PLUGIN.md` §6.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const apk = join(repoRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const shell = process.platform === 'win32';

if (!existsSync(apk)) {
  console.error(`No APK at ${apk} — build one with: npm run apk:debug`);
  process.exit(1);
}

const devices = spawnSync('adb', ['devices'], { encoding: 'utf8', shell });
if (devices.status !== 0) {
  console.error('adb is not on PATH. Install platform-tools, or use Android Studio to deploy.');
  process.exit(1);
}

const connected = devices.stdout
  .split('\n')
  .slice(1)
  .some((line) => /\tdevice$/.test(line.trim().replace(/ +/g, '\t')));

if (!connected) {
  console.error(
    'No adb device. Plug in USB with debugging on, or pair wireless debugging and run: adb connect <ip>:<port>',
  );
  process.exit(1);
}

const install = spawnSync('adb', ['install', '-r', apk], { stdio: 'inherit', shell });
if (install.status !== 0) process.exit(install.status ?? 1);

console.log('\nInstalled.');
console.log(
  'Packaged APKs load their own assets. For live reload, set CAP_SERVER_URL to this PC before `cap sync`.',
);
