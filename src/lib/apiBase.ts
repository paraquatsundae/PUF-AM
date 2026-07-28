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
