import { Capacitor } from '@capacitor/core';

/**
 * Base URL for Express `/api/*` routes.
 * - Live-reload (Capacitor `server.url`, browser): '' (same-origin) — includes
 *   http://127.0.0.1:3000 via `adb reverse` and http://<lan-ip>:3000
 * - Packaged Capacitor Android (https://localhost assets): http://10.0.2.2:3000 (emulator)
 * - Physical packaged device: set VITE_API_BASE_URL=http://<pc-lan-ip>:3000
 */
export function getApiBaseUrl(): string {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (typeof window === 'undefined') return '';

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
