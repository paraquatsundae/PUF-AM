import { Capacitor } from '@capacitor/core';

import { hubDefersToCloud } from '../../shared/sync/hubInfo.ts';
import { getDesktopBridge, isDesktopShell } from './desktopBridge.ts';
import { getHubInfo, getHubToken } from './hubIdentity.ts';

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
 * The Android *emulator's* alias for the development machine's loopback. It is
 * meaningless on a physical tablet: `10.0.2.2` is an ordinary address in the
 * 10/8 block that no shed laptop answers on, so a fetch there does not fail
 * fast — it hangs until the TCP connect times out and then surfaces as a bare
 * `TypeError: Failed to fetch`. `ensureSyncHub()` probes it before it is used.
 */
export const EMULATOR_HOST_BASE = 'http://10.0.2.2:3000';

/**
 * Base URL for Express `/api/*` routes.
 * - Live-reload (Capacitor `server.url`, browser): '' (same-origin) — includes
 *   http://127.0.0.1:3000 via `adb reverse` and http://<lan-ip>:3000
 * - Packaged Capacitor Android: whatever hub was discovered by NSD, typed in by
 *   the operator, or baked in as VITE_API_BASE_URL — and '' until there is one.
 *   The APK hosts no Express of its own, so there is no honest default here.
 * - Electron desktop: always '' (same-origin loopback); see `apiUrl()`
 */
export function setRuntimeApiBaseUrl(baseUrl: string | null): void {
  // Normalised rather than trusted. `fetch()` on an address that is not a URL at
  // all — `192.168.1.1205:3000`, a fourth octet typed one digit long — rejects
  // with the same bare `TypeError` as an unplugged laptop, so an address that
  // cannot possibly work must not become this device's hub.
  runtimeApiBase = baseUrl ? normalizeHubBase(baseUrl) || null : null;
}

/**
 * True on a packaged APK, where `https://localhost` serves bundled assets rather
 * than a live Vite/Express host — so a same-origin `/api/*` call reaches the
 * WebView's own asset handler and quietly comes back as `index.html`.
 * Live-reload builds load over `http://` and must stay same-origin.
 */
export function isPackagedNativeAndroid(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
    const { hostname, protocol } = window.location;
    return protocol === 'https:' && (hostname === 'localhost' || hostname === '127.0.0.1');
  } catch {
    return false;
  }
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
  //
  // Validated on the way out, not just on the way in. This value outlives the
  // build that wrote it — `adb install -r` keeps WebView storage — so a hub saved
  // by an older APK, before the address field probed anything, is still in here
  // and would otherwise be handed to `fetch()` forever.
  try {
    if (Capacitor.isNativePlatform() && typeof localStorage !== 'undefined') {
      const last = normalizeHubBase(localStorage.getItem('pufom_last_sync_hub') || '');
      if (last) return last;
    }
  } catch {
    /* ignore */
  }

  return '';
}

/** True when a packaged APK has nothing to send `/api/*` at yet. */
export function apiHubMissing(): boolean {
  return isPackagedNativeAndroid() && !getApiBaseUrl();
}

export const NO_API_HUB_MESSAGE =
  'This tablet has no PUF-AM hub yet. Put the tablet and the laptop on the same Wi‑Fi, ' +
  'switch on Settings → Tablet hub in PUF-AM on the laptop, then use ' +
  'Settings → Offline & sync → Scan for hubs here — or type the laptop address ' +
  '(for example 192.168.1.20:3000).';

/** Fallback for cloud-only routes when the hub named no base of its own. */
const DEFAULT_CLOUD_API_BASE = 'https://am.pufworks.farm';

/**
 * A packaged PUF-AM desktop hub cannot serve `/api/auth/*` or `/api/weather/*` —
 * those need a Firebase service account and `DPIRD_API_KEY`, which never ship to
 * an operator machine. It says so in `/api/hub/info`, and a tablet that honours
 * it keeps invite-PIN sign-in and weather working while using that laptop as its
 * sync hub. Without this, choosing an AppImage hub silently broke both.
 *
 * A `npm run dev` hub reports no cloud-only prefixes, so this is inert there and
 * the existing workshop path is unchanged.
 */
function hubCloudBaseFor(path: string): string {
  const hub = getApiBaseUrl();
  if (!hub) return '';
  const info = getHubInfo(hub);
  if (!hubDefersToCloud(info, path)) return '';
  return (info?.cloudApiBase || DEFAULT_CLOUD_API_BASE).replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = desktopCloudBaseFor(p) || hubCloudBaseFor(p) || getApiBaseUrl();
  return base ? `${base}${p}` : p;
}

/** Matches `HUB_TOKEN_HEADER` in `desktop/lanHubAuth.ts`. */
export const HUB_TOKEN_HEADER = 'x-puf-hub-token';

/**
 * The paired-device token for whichever hub `url` is aimed at, or nothing.
 *
 * Matched against the *current* hub base rather than sent on every absolute URL:
 * the token authorises this device to one laptop, and leaking it to
 * `am.pufworks.farm` or a map tile host in a header would be careless. Relative
 * URLs never carry it — a same-origin call is the desktop shell or a live-reload
 * build, neither of which uses this credential.
 */
export function hubAuthHeaders(url: string): Record<string, string> {
  if (!url || url.startsWith('/')) return {};
  const hub = getApiBaseUrl();
  if (!hub || !url.startsWith(hub)) return {};
  const token = getHubToken(hub);
  return token ? { [HUB_TOKEN_HEADER]: token } : {};
}

const LOCAL_FREENET_SIDECAR_DEFAULT = 'http://127.0.0.1:3000';

function isLoopbackBase(base: string): boolean {
  try {
    const { hostname } = new URL(base);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

/**
 * The desktop shell hosts its own Freenet node, so the only legitimate answers
 * are same-origin or loopback. Anything else — a stale config flag, a cloud base
 * copied in by mistake — would push farm ciphertext at a machine whose Freenet
 * routes are disabled anyway (`MIST_FREENET_DISABLED=1` on Cloud Run), so fall
 * back to same-origin rather than off this machine. Plan §6.2, §14 Phase 4.
 */
function desktopFreenetBase(configured: string): string {
  const base = configured.trim().replace(/\/$/, '');
  if (!base) return '';
  return isLoopbackBase(base) ? base : '';
}

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
  if (desktop) return desktopFreenetBase(desktop.freenetApiBase);

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

/**
 * Same Express as the Freenet routes, used for the other job that must run on a
 * host with a view of the local network: resolving a short join ticket against
 * the owner's hub. A browser on `https://am.pufworks.farm` cannot fetch
 * `http://192.168.x.x` itself (mixed content), so the LAN hop happens in Node.
 */
export function mistLocalApiUrl(path: string): string {
  return mistFreenetApiUrl(path);
}

/**
 * True when Freenet API calls leave this page for a separate local Express — the
 * `am.pufworks.farm` + `npm run dev` workshop pattern. Never true on desktop: the
 * shell serves those routes itself, so there is no second process to point at.
 */
export function usesLocalFreenetSidecar(): boolean {
  if (isDesktopShell()) return false;
  const base = getMistFreenetApiBaseUrl();
  return base ? isLoopbackBase(base) : false;
}

/** `192.168.1.20:3000` and `http://192.168.1.20:3000/` both mean the same hub. */
export function normalizeHubBase(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return '';
    // A bare `192.168.1.20` almost always means the workshop Express, not port 80.
    const port = url.port || (url.protocol === 'http:' ? '3000' : '');
    return `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`;
  } catch {
    return '';
  }
}

/**
 * A fetch that failed because nothing answered, with the address it tried.
 *
 * `fetch()` rejects with a bare `TypeError: Failed to fetch` for DNS failure,
 * connection refused, timeout and a blocked cleartext request alike, and that
 * string was what the tablet showed the operator — true, and useless. The URL
 * is the whole diagnosis here, so it belongs in the message.
 */
export class ApiUnreachableError extends Error {
  readonly url: string;

  constructor(url: string, hint?: string) {
    const target = url.startsWith('/') ? `this device (${url})` : url;
    super(`Could not reach ${target}.${hint ? ` ${hint}` : ''}`);
    this.name = 'ApiUnreachableError';
    this.url = url;
  }
}

const DEFAULT_API_TIMEOUT_MS = 8000;

/**
 * `fetch` for `/api/*`, with the two things every caller here wanted anyway: a
 * timeout, so an unroutable LAN address fails in seconds rather than at the
 * platform's leisure, and an error that names the address.
 */
export async function apiFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  if (apiHubMissing() && url.startsWith('/')) {
    throw new ApiUnreachableError(url, NO_API_HUB_MESSAGE);
  }

  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal, headers, ...rest } = init ?? {};

  // Merged here rather than at ~40 call sites, the same reasoning the desktop
  // shell uses for its own loopback token: a route added later is authorised
  // without anyone remembering to.
  const authHeaders = hubAuthHeaders(url);
  const mergedHeaders =
    Object.keys(authHeaders).length === 0
      ? headers
      : { ...Object.fromEntries(new Headers(headers ?? {}).entries()), ...authHeaders };

  // Hand-rolled rather than `AbortSignal.timeout`/`any`: the oldest WebView this
  // APK targets predates both, and an exception from the timeout plumbing would
  // read as a network failure.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);

  try {
    return await fetch(url, {
      ...rest,
      ...(mergedHeaders ? { headers: mergedHeaders } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new ApiUnreachableError(url, `No answer within ${Math.round(timeoutMs / 1000)}s.`);
    }
    if (error instanceof TypeError) throw new ApiUnreachableError(url);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
