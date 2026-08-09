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
import { hostname as osHostname } from 'node:os';
import path from 'node:path';

import { BrowserWindow, app, ipcMain, session, shell } from 'electron';

import { createMistFreenetWire } from '../server/freenetHostWire.ts';
import { listLanIpv4, startPufomMdns, stopPufomMdns } from '../server/mdnsHub.ts';
import { PUFOM_MDNS_TXT_KEYS } from '../shared/sync/mdnsConstants.ts';
import { encodeDesktopConfig, type DesktopConfig } from './desktopConfig.ts';
import { LOOPBACK_TOKEN_HEADER, mintLoopbackToken } from './loopbackAuth.ts';
import {
  LAN_HUB_DEFAULT_PORT,
  mintPairingCode,
  normalizePairingCode,
  type LanHubDevice,
} from './lanHubAuth.ts';
import type { LanApiHandle } from './lanApi.ts';
import {
  DESKTOP_PREFS_DEFAULT,
  desktopPrefsPath,
  readDesktopPrefs,
  writeDesktopPrefs,
  type DesktopPrefs,
} from './desktopPrefs.ts';
import { isUsableAppPort } from './localApiPort.ts';
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
let lanApi: LanApiHandle | null = null;
let lanApiError: string | null = null;
let mdnsAdvertising = false;
/** The address currently in the mDNS A record, so a DHCP change is detectable. */
let advertisedAddress = '';
let lanAddressTimer: ReturnType<typeof setInterval> | null = null;

const LAN_ADDRESS_POLL_MS = 20_000;
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

// ---------------------------------------------------------------------------
// LAN hub — plan §6.4
//
// Off by default: a shed laptop that answers on the Wi‑Fi is a decision the
// operator makes, not something an install does to them. Everything here is
// about the *second* listener; the loopback one that serves the UI is untouched,
// so the desktop app behaves identically whether this is on or off.
// ---------------------------------------------------------------------------

/** Cached so `/api/hub/info` can answer synchronously per request. */
let freenetReachable = false;

/** Workshop override, mirroring `MIST_FREENET`: forces the LAN hub on for one launch. */
function isLanHubForcedByEnv(): boolean {
  return process.env.PUF_LAN_HUB === '1' || process.env.PUF_LAN_HUB === 'true';
}

function isLanHubEnabled(): boolean {
  return isLanHubForcedByEnv() || desktopPrefs.lanHubEnabled;
}

function lanHubPort(): number {
  const fromEnv = Number(process.env.PUF_LAN_HUB_PORT);
  if (Number.isInteger(fromEnv) && fromEnv >= 1024 && fromEnv <= 65535) return fromEnv;
  return desktopPrefs.lanHubPort || LAN_HUB_DEFAULT_PORT;
}

/**
 * The renderer's origin, and therefore where its saved farm lives.
 *
 * `PUF_APP_PORT` joins the `MIST_FREENET` / `PUF_LAN_HUB` family of one-launch
 * workshop overrides. It is deliberately *not* persisted: a smoke test that
 * pinned a port must not move the operator's storage bucket, because everything
 * the app remembers — device session, farm, preferences — is keyed to it.
 */
function appPort(): number {
  const fromEnv = Number(process.env.PUF_APP_PORT);
  if (isUsableAppPort(fromEnv)) return fromEnv;
  return desktopPrefs.appPort;
}

/**
 * Save the port that was actually bound, so the next launch reaches the same
 * `localStorage` and IndexedDB. Skipped under the env override, and skipped
 * when nothing moved, so an ordinary launch does not rewrite the prefs file.
 */
function rememberAppPort(port: number): void {
  if (isUsableAppPort(Number(process.env.PUF_APP_PORT))) return;
  if (port === desktopPrefs.appPort) return;
  console.log(
    `[desktop] UI port ${desktopPrefs.appPort} was taken — this install now uses ${port}. ` +
      'A farm saved on the old port has to be recovered with its FarmCode.',
  );
  persistPrefs({ appPort: port });
}

function persistPrefs(patch: Partial<DesktopPrefs>): DesktopPrefs {
  desktopPrefs = writeDesktopPrefs(desktopPrefsPath(app.getPath('userData')), {
    ...desktopPrefs,
    ...patch,
  });
  return desktopPrefs;
}

/**
 * Workshop override, in the same family as `MIST_FREENET` and `PUF_FREENET_BIN`:
 * pin the pairing code for one launch so a smoke test can pair without reading
 * the operator's saved one. Never persisted — the saved code is untouched and
 * comes back at the next launch.
 */
function pairingCodeFromEnv(): string {
  return normalizePairingCode(process.env.PUF_LAN_HUB_CODE);
}

/** Minted on first enable rather than at install, so an unused hub has no code to leak. */
function ensurePairingCode(): string {
  const forced = pairingCodeFromEnv();
  if (forced) return forced;
  if (desktopPrefs.lanHubPairingCode) return desktopPrefs.lanHubPairingCode;
  return persistPrefs({ lanHubPairingCode: mintPairingCode() }).lanHubPairingCode;
}

/** What the hub will accept right now, and therefore what Settings must display. */
function activePairingCode(): string {
  return pairingCodeFromEnv() || desktopPrefs.lanHubPairingCode;
}

/**
 * Addresses a tablet could actually reach, best first.
 *
 * `listLanIpv4()` ranks by interface before address class, so a laptop with USB
 * tethering up no longer offers the tethered `192.168.42.x` ahead of its Wi‑Fi
 * address — the failure that made a discovered hub unreachable.
 */
function lanAddresses(): string[] {
  try {
    return listLanIpv4();
  } catch {
    return [];
  }
}

async function startLanHub(): Promise<void> {
  if (lanApi) return;
  lanApiError = null;

  const pairingCode = ensurePairingCode();
  const { startLanApi } = await import('./lanApi.ts');

  try {
    lanApi = await startLanApi({
      port: lanHubPort(),
      pairingCode: () => activePairingCode() || pairingCode,
      devices: () => desktopPrefs.lanHubDevices,
      onPaired: (device) => {
        persistPrefs({ lanHubDevices: [...desktopPrefs.lanHubDevices, device] });
        notifyLanHubState();
      },
      onDeviceSeen: (deviceId) => {
        const seenAt = new Date().toISOString();
        const devices = desktopPrefs.lanHubDevices.map((device) =>
          device.id === deviceId ? { ...device, lastSeenAt: seenAt } : device,
        );
        // Written through so "last seen" survives a crash, but not announced —
        // a renderer push on every tablet request would be a poll in disguise.
        persistPrefs({ lanHubDevices: devices });
      },
      cloudApiBase: () => cloudApiBase(),
      freenetReady: () => freenetReachable,
      lanAddress: () => lanAddresses()[0],
    });
  } catch (err) {
    // A busy port range or a locked-down firewall must not take the desktop app
    // down with it — the loopback UI is still the operator's own path.
    lanApiError = err instanceof Error ? err.message : String(err);
    console.warn('[lan-hub] could not start:', lanApiError);
    notifyLanHubState();
    return;
  }

  const addresses = lanAddresses();
  console.log(
    `[lan-hub] listening on ${lanApi.host}:${lanApi.port} — ` +
      (addresses.length ? addresses.map((ip) => `http://${ip}:${lanApi?.port}`).join(', ') : 'no LAN address yet'),
  );

  startLanMdns(lanApi.port);
  watchLanAddress(lanApi.port);
  notifyLanHubState();
}

/**
 * Advertise the **LAN** port, which is the whole reason this was deferred: the
 * loopback listener's ephemeral port was never reachable, so publishing it would
 * have put an address on the Wi‑Fi that answers nothing.
 */
function startLanMdns(port: number): void {
  if (mdnsAdvertising) return;
  try {
    startPufomMdns(port, {
      name: `PUF-AM (${osHostname().split('.')[0] || 'laptop'})`,
      txt: {
        [PUFOM_MDNS_TXT_KEYS.kind]: 'desktop-lan',
        [PUFOM_MDNS_TXT_KEYS.pair]: '1',
      },
    });
    mdnsAdvertising = true;
    advertisedAddress = lanAddresses()[0] ?? '';
  } catch (err) {
    // Multicast blocked or avahi absent: the manual address field is the
    // fallback, and it is printed above.
    console.warn('[mdns] not started:', err);
  }
}

/**
 * Re-advertise when this laptop's address changes underneath us.
 *
 * The listener itself is fine — it binds `0.0.0.0`, so a new DHCP lease costs it
 * nothing. The *advertisement* is not: `startPufomMdns()` bakes the address into
 * the A record and the TXT `ip=`, and both are what a tablet actually dials. A
 * laptop carried from the house Wi‑Fi to the shed's therefore kept advertising an
 * address on a network the tablet could not see, which looks exactly like a hub
 * that is refusing to answer.
 *
 * Polling rather than watching netlink: `os.networkInterfaces()` is the only
 * portable view, this has to work identically on Windows, and a lease change is
 * not something worth reacting to in under a minute.
 */
function watchLanAddress(port: number): void {
  if (lanAddressTimer) return;
  lanAddressTimer = setInterval(() => {
    if (!lanApi) return;
    const current = lanAddresses()[0] ?? '';
    if (current === advertisedAddress) return;

    console.log(
      `[lan-hub] LAN address changed ${advertisedAddress || 'none'} → ${current || 'none'} — re-advertising`,
    );
    try {
      stopPufomMdns();
    } catch {
      /* best effort */
    }
    mdnsAdvertising = false;
    advertisedAddress = current;
    if (current) startLanMdns(port);
    // Settings shows the address the operator has to read out, so it must not go
    // on displaying the old one.
    notifyLanHubState();
  }, LAN_ADDRESS_POLL_MS);
  // Never hold the app open just to poll.
  lanAddressTimer.unref?.();
}

async function stopLanHub(): Promise<void> {
  if (lanAddressTimer) {
    clearInterval(lanAddressTimer);
    lanAddressTimer = null;
  }
  advertisedAddress = '';
  if (mdnsAdvertising) {
    try {
      stopPufomMdns();
    } catch {
      /* best effort */
    }
    mdnsAdvertising = false;
  }
  const handle = lanApi;
  lanApi = null;
  await handle?.close().catch(() => undefined);
}

export type LanHubState = {
  enabled: boolean;
  /** `PUF_LAN_HUB=1` forced it on for this launch, whatever the saved preference says. */
  forcedByEnv: boolean;
  running: boolean;
  port: number;
  /** `http://<ip>:<port>` for every address a tablet could use. */
  baseUrls: string[];
  pairingCode: string;
  advertising: boolean;
  lastError: string | null;
  devices: Array<Omit<LanHubDevice, 'tokenHash'>>;
};

function lanHubState(): LanHubState {
  const port = lanApi?.port ?? lanHubPort();
  return {
    enabled: isLanHubEnabled(),
    forcedByEnv: isLanHubForcedByEnv(),
    running: Boolean(lanApi),
    port,
    baseUrls: lanApi ? lanAddresses().map((ip) => `http://${ip}:${port}`) : [],
    pairingCode: activePairingCode(),
    advertising: mdnsAdvertising,
    lastError: lanApiError,
    // The token hashes stay in main. They are not usable as credentials, but the
    // renderer has no reason to hold them either.
    devices: desktopPrefs.lanHubDevices.map(({ tokenHash: _tokenHash, ...rest }) => rest),
  };
}

function notifyLanHubState(): void {
  mainWindow?.webContents.send('puf-desktop:lan-hub-state', lanHubState());
}

async function setLanHubEnabled(enabled: boolean): Promise<LanHubState> {
  persistPrefs({ lanHubEnabled: enabled });
  if (enabled) {
    await startLanHub();
  } else if (!isLanHubForcedByEnv()) {
    await stopLanHub();
    lanApiError = null;
  }
  // With `PUF_LAN_HUB=1` in play the listener stays up for this launch — pulling
  // it out from under a workshop session would be a surprise, and the saved
  // preference is what the next launch reads.
  return lanHubState();
}

/**
 * Rotate the code. Paired tablets keep working: their tokens are independent of
 * the code, which is the point of the two-step. Revoking a tablet is
 * `forgetLanHubDevice`, and the two being separate is what lets an operator kill
 * a shoulder-surfed code without re-pairing the shed.
 */
function rotateLanPairingCode(): LanHubState {
  persistPrefs({ lanHubPairingCode: mintPairingCode() });
  // With `PUF_LAN_HUB_CODE` pinned, the new saved code will not take effect until
  // the next launch, and `lanHubState()` reports the pinned one so Settings does
  // not show a code the hub will reject.
  return lanHubState();
}

function forgetLanHubDevice(deviceId: string): LanHubState {
  persistPrefs({
    lanHubDevices: desktopPrefs.lanHubDevices.filter((device) => device.id !== deviceId),
  });
  return lanHubState();
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
 * Resolve the assets the mist PUT paths need.
 *
 * Phase 1 bundles nothing, so all of them fall back to the dev tree or `PATH`. Only
 * report a path that actually exists: `mist-freenet` has working defaults for each,
 * and handing it a missing bundled path would break publishing outright rather than
 * quietly degrading. The WASM paths in particular *must* be set here, because
 * `mist-freenet` derives its own defaults from `import.meta.url`, which does not
 * survive bundling into a CJS Electron main.
 *
 * Both contracts, not just the pack one: a short join ticket is published to the
 * **slot** contract, and a packaged build that cannot find that WASM still mints
 * tickets — they just never resolve anywhere but the owner's own Wi-Fi.
 */
function resolveMistAssets(): { fdevBin?: string; packWasm?: string; slotWasm?: string } {
  const appPath = app.getAppPath();
  const { resourcesPath } = process as NodeJS.Process & { resourcesPath?: string };
  const resources = resourcesPath ?? appPath;

  const fdev = resolveFreenetBinary(FDEV_BINARY, {
    searchPaths: [bundledFreenetDir()],
    repoRoot: appPath,
    env: process.env,
  });

  const contractWasm = (name: string) =>
    [
      path.join(resources, 'contracts', name),
      path.join(appPath, 'units', 'mist-freenet', 'assets', name),
    ].find((candidate) => existsSync(candidate));

  return {
    fdevBin: fdev.binary?.path,
    packWasm: contractWasm('pack-contract.wasm'),
    slotWasm: contractWasm('slot-contract.wasm'),
  };
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
      // The LAN hub reports Freenet readiness to paired tablets, so it has to
      // learn about it here rather than probing per request.
      freenetReachable = event.status.reachable === true;
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
  const { fdevBin, packWasm, slotWasm } = resolveMistAssets();
  Object.assign(process.env, freenetHostEnv(status, { fdevBin, packWasm, slotWasm }), {
    MIST_FREENET: '1',
  });
}

async function startFreenet(): Promise<FreenetHostStatus | null> {
  if (!freenetHost) freenetHost = createHost();
  try {
    const status = await freenetHost.start();
    applyFreenetEnv(status);
    freenetReachable = status.reachable === true;
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
  freenetReachable = status.reachable === true;
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
  ipcMain.handle('puf-desktop:lan-hub', () => lanHubState());
  ipcMain.handle('puf-desktop:set-lan-hub', async (_event, enabled: unknown) =>
    setLanHubEnabled(enabled === true),
  );
  ipcMain.handle('puf-desktop:rotate-lan-pairing-code', () => rotateLanPairingCode());
  ipcMain.handle('puf-desktop:forget-lan-device', (_event, deviceId: unknown) =>
    forgetLanHubDevice(String(deviceId ?? '')),
  );
}

/**
 * Authorise the renderer against the loopback guard without the renderer ever
 * holding the token (plan §6.3).
 *
 * Injecting at the session means all ~40 `/api/*` call sites in `src/` stay
 * unchanged — including the ones that cannot set headers at all — while a local
 * process that guessed the port still gets 401.
 *
 * The origin test is done in JS rather than through `webRequest`'s URL filter
 * because those are Chromium match patterns, which have no notion of a port —
 * and this API's port is different every launch. Matching the exact prefix is
 * what keeps the token off requests to `am.pufworks.farm`.
 */
function authorizeRendererApiCalls(apiUrl: string, token: string): void {
  const prefix = `${apiUrl}/api/`;
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!details.url.startsWith(prefix)) {
      callback({});
      return;
    }
    callback({
      requestHeaders: { ...details.requestHeaders, [LOOPBACK_TOKEN_HEADER]: token },
    });
  });
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

  const loopbackToken = mintLoopbackToken();
  const { startLocalApi } = await import('./localApi.ts');
  const localApi = await startLocalApi({
    distPath,
    authToken: loopbackToken,
    port: appPort(),
  });
  closeLocalApi = localApi.close;
  rememberAppPort(localApi.port);
  console.log(`[desktop] local API + UI on ${localApi.url} (token-guarded)`);

  authorizeRendererApiCalls(localApi.url, loopbackToken);
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

  // After the window, so a slow bind or a blocked port cannot delay first paint,
  // and so `notifyLanHubState()` has somewhere to send the result.
  if (isLanHubEnabled()) await startLanHub();
}

async function shutdown(): Promise<void> {
  try {
    await stopLanHub();
  } catch {
    /* best effort on quit */
  }
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
