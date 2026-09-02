/**
 * Sync Capacitor Android to load the live Express/Vite app from this PC's LAN IP.
 *
 * Cross-platform replacement for `sync-android-lan.ps1`, so `npm run
 * sync:android:lan` means the same thing on Fedora and Windows.
 * Plan: `Plans/OFFLINE_MAP_APK.md`.
 *
 * Requires: `npm run dev` already running on port 3000; phone/tablet on the same Wi-Fi.
 */

import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3000;

// Container and virtual-machine bridges answer on the host but are unreachable
// from a tablet, so they must never win the pick.
const VIRTUAL = /^(docker|podman|cni-|veth|virbr|br-|vmnet|vboxnet|tun|tap|utun|zt)/i;
const WIRELESS = /^(wl|wlan|wifi|wi-fi)/i;

function findLanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      // 172.16–172.31 is the private range Docker/Podman carve their bridges from.
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr.address)) continue;
      candidates.push({ name, ip: addr.address });
    }
  }
  // Prefer Wi-Fi: the tablet is on Wi-Fi, and a wired host IP may be on another subnet.
  candidates.sort((a, b) => Number(WIRELESS.test(b.name)) - Number(WIRELESS.test(a.name)));
  return candidates[0] ?? null;
}

const lan = findLanIp();
if (!lan) {
  console.error('No LAN IPv4 found. Connect Wi-Fi/Ethernet and retry.');
  process.exit(1);
}

const url = `http://${lan.ip}:${PORT}`;
console.log(`CAP_SERVER_URL=${url}  (interface ${lan.name})`);

try {
  const probe = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(4000) });
  console.log(`Health check: ${probe.status}`);
} catch {
  console.warn(`Warning: could not reach ${url}/api/health — start 'npm run dev' first, then re-run.`);
}

const sync = spawnSync('npx', ['cap', 'sync', 'android'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CAP_SERVER_URL: url },
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log('');
console.log('Next: npm run open:android  → Run on a physical device (same Wi-Fi).');
console.log(`Phone browser (no APK): ${url}`);
