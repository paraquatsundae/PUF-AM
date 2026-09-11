/**
 * Live check for the native PUT path — Plans/FREENET_NETWORK_PACK.md Phase 2.
 *
 * Phase 2 made the app's own WebSocket clients the only way anything is published
 * to Freenet (`BrowserFreenetPutClient`, `BrowserFreenetSlotClient`), and pinned
 * the node they were written against. The hermetic suites prove the wiring; this
 * script proves the *node*: it starts the vendored `freenet network` on a throwaway
 * data dir, points the `FREENET_LIVE_WS=1` suites at it, stops it, and prints one
 * verdict line with the node version. A pass is what flips a platform's status in
 * `scripts/freenet-binaries.json` from `pending-live-check` to `verified`.
 *
 * It is a second, throwaway node, which takes more isolation than it looks: its
 * own config/data/log dirs *and* a spare `--network-port`. Freenet's peer UDP
 * socket defaults to 31337 regardless of the WS port, so two nodes with different
 * `--ws-api-port` values still contend for it. `attachIfRunning` is off on purpose —
 * attaching to whatever is already on the port would prove nothing about the
 * pinned binary.
 *
 * Usage:
 *   npm run mist:smoke:native
 *   npx tsx scripts/smoke-freenet-native.ts [--port 7509] [--network-port 31437] [--settle 5000] [--keep]
 *     --port          WS API port for the throwaway node (default 7509, the clients' default)
 *     --network-port  peer UDP port (default 31437 — off the 31337 a workshop node would hold)
 *     --settle        ms to wait after the WS API answers before publishing (default 5000)
 *     --keep          leave the temp dirs behind for inspection
 *
 * Needs a populated `vendor/` (`npm run desktop:vendor`) or a `PUF_FREENET_BIN`.
 * Exit code is vitest's, so this can gate a release script.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFreenetHost } from '../units/puf-freenet-host/src/index.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The suites that only run under FREENET_LIVE_WS=1; order is PUT → slot → GET → transport round-trip. */
const LIVE_SUITES = [
  'units/mist-freenet/freenet02-native-put-live.test.ts',
  'units/mist-freenet/freenet02-native-slot-live.test.ts',
  'units/mist-freenet/freenet02-browser-get-live.test.ts',
  'units/mist-freenet/freenet02-live.test.ts',
];

function numericFlag(argv: string[], flag: string, fallback: number): number {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} needs a non-negative integer`);
  return value;
}

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const wsPort = numericFlag(argv, '--port', 7509);
const networkPort = numericFlag(argv, '--network-port', 31437);
const settleMs = numericFlag(argv, '--settle', 5000);

const root = mkdtempSync(path.join(tmpdir(), 'puf-freenet-native-smoke-'));

const host = createFreenetHost({
  configDir: path.join(root, 'config'),
  dataDir: path.join(root, 'data'),
  logDir: path.join(root, 'logs'),
  wsPort,
  networkPort,
  repoRoot: REPO_ROOT,
  attachIfRunning: false,
  autoRestart: false,
});

host.on((event) => {
  if (event.type === 'log' && event.stream === 'stderr') console.log(`  [freenet] ${event.line}`);
});

function runLiveSuites(wsUrl: string): Promise<number> {
  // Vitest as a child rather than an import: the suites decide live/skip at
  // module load from process.env, so they must start in a process that already
  // has FREENET_LIVE_WS set. The VITE_* vars are dropped for the reason in
  // AGENTS.md §5 — a configured API base makes unrelated suites fail.
  const { VITE_API_BASE_URL: _apiBase, VITE_APP_URL: _appUrl, ...env } = process.env;
  const child = spawn(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...LIVE_SUITES],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...env, FREENET_LIVE_WS: '1', FREENET_WS_URL: wsUrl },
    },
  );
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function main(): Promise<number> {
  console.log(`native smoke: ws port ${wsPort}, network port ${networkPort}, dirs under ${root}`);
  const status = await host.start();

  console.log(`  mode      ${status.mode}`);
  console.log(`  source    ${status.binary?.source}`);
  console.log(`  binary    ${status.binary?.path}`);
  console.log(`  version   ${status.binary?.version}`);
  console.log(`  ws        ${status.wsUrl}`);

  if (status.mode !== 'managed') throw new Error(`expected mode 'managed', got '${status.mode}'`);
  if (status.binary?.source === 'path') {
    throw new Error(
      "resolved from PATH — vendor/ is empty or lost. Run `npm run desktop:vendor` (plan §5.3).",
    );
  }

  if (settleMs > 0) {
    console.log(`  settling ${settleMs} ms before the first PUT`);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }

  const exitCode = await runLiveSuites(status.wsUrl);
  const version = status.binary?.version ?? 'unknown version';
  const source = status.binary?.source ?? 'unknown source';

  await host.stop();

  if (exitCode === 0) {
    console.log(
      `\nnative smoke PASSED: freenet ${version} (${source}) accepted native PUT, slot PUT/UPDATE and GET ` +
        `over ${status.wsUrl} — ${LIVE_SUITES.length} live suites green.`,
    );
  } else {
    console.log(
      `\nnative smoke FAILED: freenet ${version} (${source}) — vitest exit ${exitCode}; ` +
        `see the suite output above${keep ? ` and the node logs under ${root}` : ' (re-run with --keep for node logs)'}.`,
    );
  }
  return exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(async (err: unknown) => {
    console.error(`\nnative smoke FAILED before the suites ran: ${err instanceof Error ? err.message : err}`);
    await host.stop().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => {
    if (keep) console.log(`temp dirs kept at ${root}`);
    else rmSync(root, { recursive: true, force: true });
  });
