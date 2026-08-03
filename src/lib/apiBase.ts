import { Capacitor } from '@capacitor/core';

/** Session override from NSD / Offline & sync peer picker (packaged APK). */
let runtimeApiBase: string | null = null;

/**
 * Base URL for Express `/api/*` routes.
 * - Live-reload (Capacitor `server.url`, browser): '' (same-origin) — includes
 *   http://127.0.0.1:3000 via `adb reverse` and http://<lan-ip>:3000
 * - Packaged Capacitor Android (https://localhost assets): http://10.0.2.2:3000 (emulator)
 * - Physical packaged device: set VITE_API_BASE_URL=http://<pc-lan-ip>:3000
 * - Or select a hub after NSD scan (setRuntimeApiBaseUrl)
 */
export function setRuntimeApiBaseUrl(baseUrl: string | null): void {
  runtimeApiBase = baseUrl ? baseUrl.replace(/\/$/, '') : null;
}

export function getApiBaseUrl(): string {
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
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
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
 */
export function getMistFreenetApiBaseUrl(): string {
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
