/**
 * Prove the vendored Freenet binary actually runs under the host, without Electron.
 *
 * This is the Phase 2 acceptance check (`Plans/DESKTOP_FREENET_PLUGIN.md` Phase 2).
 * It deliberately uses a **spare port and throwaway dirs**, so a workshop
 * `freenet network` on `:7509` keeps running and is never attached to or killed —
 * attaching would prove nothing about which binary we resolved.
 *
 * Usage: npx tsx scripts/smoke-freenet-host.ts [--port 7609] [--keep]
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

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const portFlag = argv.indexOf('--port');
const wsPort = portFlag === -1 ? 7609 : Number(argv[portFlag + 1]);

const root = mkdtempSync(path.join(tmpdir(), 'puf-freenet-smoke-'));

const host = createFreenetHost({
  configDir: path.join(root, 'config'),
  dataDir: path.join(root, 'data'),
  logDir: path.join(root, 'logs'),
  wsPort,
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
  console.log(`smoke: ws port ${wsPort}, dirs under ${root}`);
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
