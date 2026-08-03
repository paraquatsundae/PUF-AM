/**
 * PUF-AM desktop shell — Electron main process (Phase 1 stub).
 *
 * One app, one icon, one process tree: the Freenet node is a child process this
 * main owns, so the operator never runs `freenet network` or `npm run dev`.
 *
 * Deliberately unpolished — window chrome, menus, tray, and the Settings surface
 * come later. Plan: `Plans/DESKTOP_FREENET_PLUGIN.md` §6 and Phase 1.
 */

import path from 'node:path';

import { BrowserWindow, app, ipcMain } from 'electron';

import { createMistFreenetWire } from '../server/freenetHostWire.ts';
import {
  createFreenetHost,
  freenetHostEnv,
  freenetWsUrl,
  type FreenetHostPlugin,
  type FreenetHostStatus,
} from '../units/puf-freenet-host/src/index.ts';

/** Cloud API for routes needing server-only secrets — see plan §6.2. */
const CLOUD_API_BASE = process.env.PUF_CLOUD_API_BASE?.trim() || 'https://am.pufworks.farm';

const FREENET_WS_HOST = '127.0.0.1';
const FREENET_WS_PORT = Number(process.env.FREENET_WS_PORT) || 7509;

type DesktopConfig = {
  isDesktop: true;
  /** Base for `/api/*` — cloud, because invite PIN and DPIRD need server secrets. */
  apiBase: string;
  /** Base for `/api/mist/freenet/*` — empty string means same-origin loopback. */
  freenetApiBase: string;
  mistEnabled: boolean;
};

let mainWindow: BrowserWindow | null = null;
let freenetHost: FreenetHostPlugin | null = null;
let closeLocalApi: (() => Promise<void>) | null = null;

/** Mist is opt-in; a Firebase-only operator never starts a Freenet node. */
function isMistEnabled(): boolean {
  return process.env.MIST_FREENET === '1' || process.env.MIST_FREENET === 'true';
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
function bundledResourcePaths() {
  // resourcesPath is an Electron addition to `process`; typed locally so this
  // file checks with or without @types/electron present.
  const { resourcesPath } = process as NodeJS.Process & { resourcesPath?: string };
  const resources = resourcesPath ?? app.getAppPath();
  return {
    freenetDir: path.join(resources, 'freenet'),
    fdevBin: path.join(resources, 'freenet', process.platform === 'win32' ? 'fdev.exe' : 'fdev'),
    packWasm: path.join(resources, 'contracts', 'pack-contract.wasm'),
  };
}

function createHost(): FreenetHostPlugin {
  const { configDir, dataDir, logDir } = userDataPaths();
  const { freenetDir } = bundledResourcePaths();

  const host = createFreenetHost({
    configDir,
    dataDir,
    logDir,
    wsHost: FREENET_WS_HOST,
    wsPort: FREENET_WS_PORT,
    binarySearchPaths: [freenetDir],
    wire: createMistFreenetWire({ wsUrl: freenetWsUrl(FREENET_WS_HOST, FREENET_WS_PORT) }),
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
 * Publish the node's coordinates before anything in `units/mist-freenet` loads,
 * so its transport and `fdev` PUT path pick up the app-owned node (plan §5.5).
 */
function applyFreenetEnv(status: FreenetHostStatus): void {
  const { fdevBin, packWasm } = bundledResourcePaths();
  const { mistRoot } = userDataPaths();
  Object.assign(
    process.env,
    freenetHostEnv(status, { fdevBin, packWasm, mistRoot }),
    { MIST_FREENET: '1' },
  );
}

async function startFreenet(): Promise<FreenetHostStatus | null> {
  if (!freenetHost) freenetHost = createHost();
  try {
    const status = await freenetHost.start();
    applyFreenetEnv(status);
    console.log(`[freenet] mode=${status.mode} source=${status.binary?.source ?? 'n/a'}`);
    return status;
  } catch (err) {
    // A missing or broken node must not block Firebase / local-only use.
    console.warn('[freenet] host start failed:', err instanceof Error ? err.message : err);
    return freenetHost ? freenetHost.status() : null;
  }
}

function registerIpc(): void {
  ipcMain.handle('puf-freenet:status', async () => freenetHost?.status() ?? null);
  ipcMain.handle('puf-freenet:start', async () => startFreenet());
  ipcMain.handle('puf-freenet:stop', async () => freenetHost?.stop() ?? null);
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
      additionalArguments: [
        `--puf-desktop-config=${Buffer.from(JSON.stringify(config)).toString('base64')}`,
      ],
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(appUrl);
}

async function bootstrap(): Promise<void> {
  const mistEnabled = isMistEnabled();
  if (mistEnabled) await startFreenet();

  const { startLocalApi } = await import('./localApi.ts');
  const localApi = await startLocalApi({
    distPath: path.join(app.getAppPath(), 'dist'),
  });
  closeLocalApi = localApi.close;
  console.log(`[desktop] local API + UI on ${localApi.url}`);

  registerIpc();

  await createWindow(
    {
      isDesktop: true,
      apiBase: CLOUD_API_BASE,
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
}
