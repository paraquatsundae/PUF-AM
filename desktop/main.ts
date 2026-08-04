/**
 * PUF-AM desktop shell — Electron main process.
 *
 * One app, one icon, one process tree: the Freenet node is a child process this
 * main owns, so the operator never runs `freenet network` or `npm run dev`.
 *
 * Window chrome, menus, and tray still come later. Plan:
 * `Plans/DESKTOP_FREENET_PLUGIN.md` §6 and Phase 1.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { BrowserWindow, app, ipcMain, shell } from 'electron';

import { createMistFreenetWire } from '../server/freenetHostWire.ts';
import { encodeDesktopConfig, type DesktopConfig } from './desktopConfig.ts';
import {
  DESKTOP_PREFS_DEFAULT,
  desktopPrefsPath,
  readDesktopPrefs,
  writeDesktopPrefs,
  type DesktopPrefs,
} from './desktopPrefs.ts';
import {
  FDEV_BINARY,
  createFreenetHost,
  freenetHostEnv,
  freenetWsUrl,
  resolveFreenetBinary,
  type FreenetHostPlugin,
  type FreenetHostStatus,
} from '../units/puf-freenet-host/src/index.ts';

const FREENET_WS_HOST = '127.0.0.1';

let mainWindow: BrowserWindow | null = null;
let freenetHost: FreenetHostPlugin | null = null;
let closeLocalApi: (() => Promise<void>) | null = null;
let desktopPrefs: DesktopPrefs = { ...DESKTOP_PREFS_DEFAULT };

/** Cloud API for routes needing server-only secrets — see plan §6.2. */
function cloudApiBase(): string {
  return process.env.PUF_CLOUD_API_BASE?.trim() || 'https://am.pufworks.farm';
}

function freenetWsPort(): number {
  return Number(process.env.FREENET_WS_PORT) || 7509;
}

/** Workshop override: forces mist on for one launch, whatever the saved preference says. */
function isMistForcedByEnv(): boolean {
  return process.env.MIST_FREENET === '1' || process.env.MIST_FREENET === 'true';
}

/**
 * Mist is opt-in; a Firebase-only operator never starts a Freenet node.
 *
 * The saved preference is what an installed operator uses — asking a farmer to
 * launch the AppImage from a terminal with an environment variable set was never
 * a product. `MIST_FREENET` stays as the workshop override.
 */
function isMistEnabled(): boolean {
  return isMistForcedByEnv() || desktopPrefs.mistEnabled;
}

function mistPreference(): { enabled: boolean; forcedByEnv: boolean } {
  return { enabled: desktopPrefs.mistEnabled, forcedByEnv: isMistForcedByEnv() };
}

/**
 * Apply the Settings toggle: persist it, then make this session match so the
 * operator does not have to relaunch to see the difference.
 */
async function setMistPreference(enabled: boolean): Promise<
  ReturnType<typeof mistPreference> & { host: FreenetHostStatus | null }
> {
  desktopPrefs = writeDesktopPrefs(desktopPrefsPath(app.getPath('userData')), {
    ...desktopPrefs,
    mistEnabled: enabled,
  });

  if (enabled) {
    return { ...mistPreference(), host: await startFreenet() };
  }

  // With the env override in play the node has to stay up for this launch —
  // turning it off underneath a workshop session would be a surprise.
  if (isMistForcedByEnv()) {
    return { ...mistPreference(), host: freenetHost ? await freenetHost.status() : null };
  }

  // The host only ever stops a node it spawned; an attached one is detached (plan §5.4).
  const host = (await freenetHost?.stop().catch(() => null)) ?? null;
  return { ...mistPreference(), host };
}

/**
 * Workshop convenience: `.env` supplies `MIST_FREENET`, `PUF_FREENET_BIN`, and the
 * cloud base during `npm run desktop:dev`. A packaged app must never read a stray
 * `.env` from whatever directory the operator happened to launch it from.
 */
async function loadDevEnv(): Promise<void> {
  if (app.isPackaged) return;
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch {
    /* .env is optional */
  }
}

function userDataPaths() {
  const userData = app.getPath('userData');
  return {
    configDir: path.join(userData, 'freenet', 'config'),
    dataDir: path.join(userData, 'freenet', 'data'),
    logDir: path.join(userData, 'freenet', 'logs'),
    mistRoot: path.join(userData, 'mist-freenet'),
  };
}

/** Bundled binaries and the pack contract live outside app.asar — `fdev` needs real paths. */
function bundledFreenetDir(): string {
  const { resourcesPath } = process as NodeJS.Process & { resourcesPath?: string };
  return path.join(resourcesPath ?? app.getAppPath(), 'freenet');
}

/**
 * Resolve the two assets the mist PUT path needs.
 *
 * Phase 1 bundles nothing, so both fall back to the dev tree or `PATH`. Only report
 * a path that actually exists: `mist-freenet` has working defaults for both, and
 * handing it a missing bundled path would break publishing outright rather than
 * quietly degrading. The pack WASM in particular *must* be set here, because
 * `mist-freenet` derives its own default from `import.meta.url`, which does not
 * survive bundling into a CJS Electron main.
 */
function resolveMistAssets(): { fdevBin?: string; packWasm?: string } {
  const appPath = app.getAppPath();
  const { resourcesPath } = process as NodeJS.Process & { resourcesPath?: string };
  const resources = resourcesPath ?? appPath;

  const fdev = resolveFreenetBinary(FDEV_BINARY, {
    searchPaths: [bundledFreenetDir()],
    repoRoot: appPath,
    env: process.env,
  });

  const packWasm = [
    path.join(resources, 'contracts', 'pack-contract.wasm'),
    path.join(appPath, 'units', 'mist-freenet', 'assets', 'pack-contract.wasm'),
  ].find((candidate) => existsSync(candidate));

  return { fdevBin: fdev.binary?.path, packWasm };
}

function createHost(): FreenetHostPlugin {
  const { configDir, dataDir, logDir } = userDataPaths();
  const wsPort = freenetWsPort();

  const host = createFreenetHost({
    configDir,
    dataDir,
    logDir,
    wsHost: FREENET_WS_HOST,
    wsPort,
    binarySearchPaths: [bundledFreenetDir()],
    repoRoot: app.getAppPath(),
    wire: createMistFreenetWire({ wsUrl: freenetWsUrl(FREENET_WS_HOST, wsPort) }),
  });

  host.on((event) => {
    if (event.type === 'log') {
      console.log(`[freenet:${event.stream}] ${event.line}`);
      return;
    }
    if (event.type === 'state') {
      mainWindow?.webContents.send('puf-freenet:state', event.status);
      return;
    }
    if (event.type === 'update-required') {
      console.warn('[freenet] node requested an update (exit 42) — bundled binary left as-is');
    }
  });

  return host;
}

/**
 * Anchor the mist store under `userData` before anything in `server/` loads.
 *
 * This runs even when the Freenet host fails to start, because
 * `getMistFreenetRootDir()` otherwise falls back to `process.cwd()/tmp` — wherever
 * the operator's launcher happened to be, which is meaningless once packaged.
 * An explicit `MIST_FREENET_ROOT` (documented workshop override) still wins.
 */
function applyMistRootEnv(): void {
  if (process.env.MIST_FREENET_ROOT?.trim()) return;
  process.env.MIST_FREENET_ROOT = userDataPaths().mistRoot;
}

/**
 * Publish the node's coordinates before anything in `units/mist-freenet` loads,
 * so its transport and `fdev` PUT path pick up the app-owned node (plan §5.5).
 */
function applyFreenetEnv(status: FreenetHostStatus): void {
  const { fdevBin, packWasm } = resolveMistAssets();
  Object.assign(process.env, freenetHostEnv(status, { fdevBin, packWasm }), {
    MIST_FREENET: '1',
  });
}

async function startFreenet(): Promise<FreenetHostStatus | null> {
  if (!freenetHost) freenetHost = createHost();
  try {
    const status = await freenetHost.start();
    applyFreenetEnv(status);
    console.log(`[freenet] mode=${status.mode} source=${status.binary?.source ?? 'attached'}`);
    return status;
  } catch (err) {
    // A missing or broken node must not block Firebase / local-only use.
    console.warn('[freenet] host start failed:', err instanceof Error ? err.message : err);
    return freenetHost ? freenetHost.status() : null;
  }
}

/**
 * Answer "what is the node doing *right now*" — always from a live probe.
 *
 * The host object is created on demand because mist may have been off at boot:
 * without this, every status read before the first start returned `null` and the
 * workshop's refresh button could never report anything. Creating a host spawns
 * nothing; only `start()` does. A node that answers the probe is adopted as
 * `attached`, so its coordinates must reach `units/mist-freenet` too.
 */
async function readFreenetStatus(): Promise<FreenetHostStatus> {
  if (!freenetHost) freenetHost = createHost();
  const status = await freenetHost.status({ probe: true });
  if (status.reachable) applyFreenetEnv(status);
  return status;
}

function registerIpc(): void {
  ipcMain.handle('puf-freenet:status', async () => readFreenetStatus());
  ipcMain.handle('puf-freenet:start', async () => startFreenet());
  ipcMain.handle('puf-freenet:stop', async () => freenetHost?.stop() ?? null);
  ipcMain.handle('puf-desktop:mist-preference', () => mistPreference());
  ipcMain.handle('puf-desktop:set-mist-preference', async (_event, enabled: unknown) =>
    setMistPreference(enabled === true),
  );
}

/** The built Vite bundle the loopback server hosts. */
function resolveDistPath(): string {
  const distPath = path.join(app.getAppPath(), 'dist');
  if (!existsSync(path.join(distPath, 'index.html'))) {
    throw new Error(`No built UI at ${distPath} — run \`npm run build\` first`);
  }
  return distPath;
}

async function createWindow(config: DesktopConfig, appUrl: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'desktop', 'build', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [encodeDesktopConfig(config)],
    },
  });

  // Docs and map attributions are the operator's browser's job, not a chromeless
  // Electron window with our preload attached.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(appUrl);
}

async function bootstrap(): Promise<void> {
  await loadDevEnv();
  applyMistRootEnv();
  desktopPrefs = readDesktopPrefs(desktopPrefsPath(app.getPath('userData')));

  const mistEnabled = isMistEnabled();
  const distPath = resolveDistPath();
  if (mistEnabled) await startFreenet();

  const { startLocalApi } = await import('./localApi.ts');
  const localApi = await startLocalApi({ distPath });
  closeLocalApi = localApi.close;
  console.log(`[desktop] local API + UI on ${localApi.url}`);

  registerIpc();

  await createWindow(
    {
      isDesktop: true,
      cloudApiBase: cloudApiBase(),
      freenetApiBase: '',
      mistEnabled,
    },
    localApi.url,
  );
}

async function shutdown(): Promise<void> {
  try {
    await freenetHost?.stop();
  } catch {
    /* best effort on quit */
  }
  try {
    await closeLocalApi?.();
  } catch {
    /* best effort on quit */
  }
}

// Two instances would fight over the Freenet WS port and the mist cache.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err: unknown) => {
    console.error('[desktop] bootstrap failed:', err);
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    event.preventDefault();
    void shutdown().finally(() => app.exit(0));
  });

  // Ctrl-C in a `npm run desktop:dev` terminal would otherwise orphan a managed
  // Freenet node, which then holds the WS port against the next launch.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => app.quit());
  }
}
