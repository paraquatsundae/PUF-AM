/**
 * Prove the vendored Freenet binary actually runs under the host, without Electron.
 *
 * This is the Phase 2 acceptance check (`Plans/DESKTOP_FREENET_PLUGIN.md` Phase 2).
 * It runs a **second, throwaway node**, which takes more isolation than it looks:
 * spare WS API port, throwaway config/data/log dirs, *and* a spare
 * `--network-port`. The last one is not optional — Freenet's peer-to-peer UDP
 * socket defaults to 31337 regardless of the WS port, so two nodes with different
 * `--ws-api-port` values still contend for it, which can destabilise the node that
 * was there first.
 *
 * `attachIfRunning` is off on purpose: attaching to a workshop `freenet network`
 * would prove nothing about which binary we resolved, which is the whole question.
 *
 * Usage: npx tsx scripts/smoke-freenet-host.ts [--port 7609] [--network-port 31437] [--keep]
 *   --keep  leave the temp config/data/log dirs behind for inspection
 *
 * Needs a populated `vendor/` (`npm run desktop:vendor`) or a `PUF_FREENET_BIN`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFreenetHost } from '../units/puf-freenet-host/src/index.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function numericFlag(argv: string[], flag: string, fallback: number): number {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} needs a port number`);
  return value;
}

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const wsPort = numericFlag(argv, '--port', 7609);
const networkPort = numericFlag(argv, '--network-port', 31437);

const root = mkdtempSync(path.join(tmpdir(), 'puf-freenet-smoke-'));

const host = createFreenetHost({
  configDir: path.join(root, 'config'),
  dataDir: path.join(root, 'data'),
  logDir: path.join(root, 'logs'),
  wsPort,
  networkPort,
  repoRoot: REPO_ROOT,
  // A spare port has nothing on it; if something *is* there, fail loudly rather
  // than reporting a pass for someone else's node.
  attachIfRunning: false,
  autoRestart: false,
});

host.on((event) => {
  if (event.type === 'log' && event.stream === 'stderr') console.log(`  [freenet] ${event.line}`);
});

async function main(): Promise<void> {
  console.log(`smoke: ws port ${wsPort}, network port ${networkPort}, dirs under ${root}`);
  const status = await host.start();

  console.log(`  mode      ${status.mode}`);
  console.log(`  source    ${status.binary?.source}`);
  console.log(`  binary    ${status.binary?.path}`);
  console.log(`  version   ${status.binary?.version}`);
  console.log(`  pid       ${status.pid}`);

  if (status.mode !== 'managed') throw new Error(`expected mode 'managed', got '${status.mode}'`);
  if (status.binary?.source === 'path') {
    throw new Error(
      "resolved from PATH — vendor/ is empty or lost. Run `npm run desktop:vendor` (plan §5.3).",
    );
  }

  await host.stop();
  console.log(`  stopped   ${(await host.status()).mode}`);
  console.log(`\nsmoke passed: managed node from source '${status.binary?.source}'.`);
}

main()
  .catch(async (err: unknown) => {
    console.error(`\nsmoke failed: ${err instanceof Error ? err.message : err}`);
    await host.stop().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => {
    if (keep) console.log(`temp dirs kept at ${root}`);
    else rmSync(root, { recursive: true, force: true });
  });
