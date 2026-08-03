import { Capacitor } from '@capacitor/core';

import { getDesktopBridge, isDesktopShell } from './desktopBridge.ts';

/** Session override from NSD / Offline & sync peer picker (packaged APK). */
let runtimeApiBase: string | null = null;

/**
 * Routes the desktop shell must not serve itself: they need a Firebase Admin
 * service account or `DPIRD_API_KEY`, which never ship to an operator machine.
 * Everything else — Freenet, LAN sync, presence — is local by design.
 * See `Plans/DESKTOP_FREENET_PLUGIN.md` §6.2.
 */
const DESKTOP_CLOUD_ONLY_PREFIXES = ['/api/auth/', '/api/weather/'];

function desktopCloudBaseFor(path: string): string {
  const bridge = getDesktopBridge();
  if (!bridge) return '';
  return DESKTOP_CLOUD_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))
    ? bridge.cloudApiBase
    : '';
}

/**
 * Base URL for Express `/api/*` routes.
 * - Live-reload (Capacitor `server.url`, browser): '' (same-origin) — includes
 *   http://127.0.0.1:3000 via `adb reverse` and http://<lan-ip>:3000
 * - Packaged Capacitor Android (https://localhost assets): http://10.0.2.2:3000 (emulator)
 * - Physical packaged device: set VITE_API_BASE_URL=http://<pc-lan-ip>:3000
 * - Or select a hub after NSD scan (setRuntimeApiBaseUrl)
 * - Electron desktop: always '' (same-origin loopback); see `apiUrl()`
 */
export function setRuntimeApiBaseUrl(baseUrl: string | null): void {
  runtimeApiBase = baseUrl ? baseUrl.replace(/\/$/, '') : null;
}

export function getApiBaseUrl(): string {
  // Electron serves the renderer from the in-app Express, so same-origin is always
  // correct here. The LAN-hub picker and VITE_API_BASE_URL target other machines;
  // on desktop this machine *is* the hub. Cloud-only routes are redirected by path
  // in `apiUrl()`.
  if (isDesktopShell()) return '';

  if (runtimeApiBase) return runtimeApiBase;

  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (typeof window === 'undefined') return '';

  // Restore last hub on packaged cold start before any scan.
  try {
    if (Capacitor.isNativePlatform() && typeof localStorage !== 'undefined') {
      const last = localStorage.getItem('pufom_last_sync_hub')?.trim().replace(/\/$/, '') || '';
      if (last) return last;
    }
  } catch {
    /* ignore */
  }

  const host = window.location.hostname;
  const protocol = window.location.protocol;

  // Packaged shell uses androidScheme https://localhost — not a live Vite/Express host.
  // Live USB reverse uses http://127.0.0.1:3000 and must stay same-origin.
  const isPackagedNative =
    Capacitor.isNativePlatform() &&
    protocol === 'https:' &&
    (host === 'localhost' || host === '127.0.0.1');

  if (isPackagedNative && Capacitor.getPlatform() === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return '';
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = desktopCloudBaseFor(p) || getApiBaseUrl();
  return base ? `${base}${p}` : p;
}

const LOCAL_FREENET_SIDECAR_DEFAULT = 'http://127.0.0.1:3000';

/** Production HTTPS host — Freenet must not use Cloud Run's container loopback. */
export function isProductionAppHost(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  if (protocol !== 'https:') return false;
  if (import.meta.env.VITE_MIST_FREENET_LOCAL === '1') return true;
  return hostname === 'am.pufworks.farm' || hostname.endsWith('.run.app');
}

/**
 * API base for `/api/mist/freenet/*` only.
 * On am.pufworks.farm the browser talks to a local Express sidecar (127.0.0.1:3000)
 * where Freenet 0.2 runs on the laptop — not Cloud Run's container.
 * The Electron desktop shell has no sidecar: it hosts the node itself, same-origin.
 */
export function getMistFreenetApiBaseUrl(): string {
  // Desktop runs the Freenet node in its own main process, so the sidecar branch
  // below must never fire — that is the whole point of the Electron shell.
  const desktop = getDesktopBridge();
  if (desktop) return desktop.freenetApiBase;

  const fromEnv = String(import.meta.env.VITE_MIST_FREENET_API || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (isProductionAppHost()) {
    return LOCAL_FREENET_SIDECAR_DEFAULT;
  }

  return getApiBaseUrl();
}

export function mistFreenetApiUrl(path: string): string {
  const base = getMistFreenetApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** True when Freenet API calls target loopback (production + local sidecar pattern). */
export function usesLocalFreenetSidecar(): boolean {
  const base = getMistFreenetApiBaseUrl();
  if (!base) return false;
  try {
    const url = new URL(base);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  } catch {
    return false;
  }
}
