import { Capacitor } from '@capacitor/core';

/**
 * Base URL for Express `/api/*` routes.
 * - Browser / Vite / Capacitor live-reload (`server.url`): '' (same-origin)
 * - Packaged Capacitor Android (no live server): http://10.0.2.2:3000
 * - Override with VITE_API_BASE_URL (e.g. http://192.168.1.10:3000 on a physical device)
 */
export function getApiBaseUrl(): string {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  // Live-reload WebView is already served from the API host → relative /api works.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === '10.0.2.2' || host === 'localhost' || host === '127.0.0.1') {
      return '';
    }
  }

  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === 'android') {
      return 'http://10.0.2.2:3000';
    }
  }
  return '';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
