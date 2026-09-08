/**
 * BYO weather function URL — not a secret.
 *
 * Design A: the owner deploys `functions-byo-weather` in their GCP project and
 * stores only that HTTPS base on `farms/{id}/settings/weather`. The DPIRD key
 * never appears here. Hosted PUF-AM origins are refused so a paste cannot point
 * crew back at George's key.
 */

export const BYO_WEATHER_UNCONFIGURED_ORIGIN = 'https://byo-weather.invalid';

/** Origins that spend the PUFworks DPIRD key. A BYO farm must never call these. */
export const PUFWORKS_WEATHER_ORIGINS = [
  'https://am.pufworks.farm',
  'https://pufom-quby5ye5pa-ts.a.run.app',
] as const;

const MAX_ENDPOINT_LEN = 500;

let runtimeEndpoint: string | null = null;

export function getRuntimeByoWeatherEndpoint(): string | null {
  return runtimeEndpoint;
}

/** Session cache filled from `settings/weather`. Null means "not set up". */
export function setRuntimeByoWeatherEndpoint(url: string | null): void {
  if (!url) {
    runtimeEndpoint = null;
    return;
  }
  const parsed = parseWeatherEndpoint(url);
  runtimeEndpoint = parsed.ok ? parsed.url : null;
}

export type ParseWeatherEndpointResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export function parseWeatherEndpointError(result: ParseWeatherEndpointResult): string | null {
  return 'error' in result ? result.error : null;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function looksLikeSecret(value: string): boolean {
  return /api-?key|secret|password|dpird|token=/i.test(value);
}

/**
 * Accept a Cloud Functions / Cloud Run base. Strip a trailing slash and a
 * pasted `/api/weather…` suffix so `apiUrl('/api/weather/…')` can append paths.
 */
export function parseWeatherEndpoint(raw: string): ParseWeatherEndpointResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Paste the byoWeatherApi URL from firebase deploy.' };
  if (trimmed.length > MAX_ENDPOINT_LEN) return { ok: false, error: 'That URL is too long.' };
  if (looksLikeSecret(trimmed)) {
    return { ok: false, error: 'That looks like a key, not a function URL. Do not paste your DPIRD key.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'That is not a URL.' };
  }

  if (url.username || url.password) {
    return { ok: false, error: 'The weather URL cannot contain a username or password.' };
  }
  if (url.hash) {
    return { ok: false, error: 'The weather URL cannot contain a #fragment.' };
  }
  if (url.search && looksLikeSecret(url.search)) {
    return { ok: false, error: 'The weather URL cannot carry a key in the query string.' };
  }

  const https = url.protocol === 'https:';
  const localHttp = url.protocol === 'http:' && isLoopbackHost(url.hostname);
  if (!https && !localHttp) {
    return { ok: false, error: 'Use https:// (http:// is only for localhost while testing).' };
  }
  if (!url.hostname) return { ok: false, error: 'That URL has no host.' };

  if ((PUFWORKS_WEATHER_ORIGINS as readonly string[]).includes(url.origin)) {
    return {
      ok: false,
      error: 'That is the PUFworks weather API. Deploy functions-byo-weather in your project and paste that URL.',
    };
  }
  if (url.hostname === 'am.pufworks.farm' || /^pufom-/i.test(url.hostname)) {
    return { ok: false, error: 'That is a PUFworks host. Use your own function URL.' };
  }

  let path = url.pathname.replace(/\/+$/, '');
  const weatherSuffix = path.indexOf('/api/weather');
  if (weatherSuffix >= 0) path = path.slice(0, weatherSuffix);

  const base = `${url.origin}${path}`.replace(/\/+$/, '');
  return { ok: true, url: base };
}

export function applyWeatherSettingsDoc(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (key === 'weatherEndpoint' || key === 'setAt') continue;
    if (/key|secret|token|password|dpird/i.test(key)) return null;
  }
  const parsed = parseWeatherEndpoint(String(rec.weatherEndpoint ?? ''));
  return parsed.ok ? parsed.url : null;
}

export function isWeatherApiPath(path: string): boolean {
  const pathname = path.split('?')[0];
  return pathname === '/api/weather' || pathname.startsWith('/api/weather/');
}

export function isPufworksWeatherOrigin(origin: string): boolean {
  return (PUFWORKS_WEATHER_ORIGINS as readonly string[]).includes(origin);
}

/**
 * Gen2 Cloud Functions URLs are `…cloudfunctions.net/<name>/api/weather/…`,
 * so the pathname does not start at `/api/weather`. Match the cached base.
 */
export function isUrlUnderByoWeatherEndpoint(url: string): boolean {
  const endpoint = getRuntimeByoWeatherEndpoint();
  if (!endpoint) return false;
  try {
    const target = new URL(url);
    const base = endpoint.replace(/\/+$/, '');
    return target.href === base || target.href.startsWith(`${base}/`);
  } catch {
    return false;
  }
}

/**
 * Base for `/api/weather/*` when this device is on BYO Firebase.
 * `undefined` — not BYO weather (hosted routing applies).
 * `null` — BYO, but no endpoint: do not fall through to PUFworks.
 */
export function byoWeatherBaseFor(path: string, isByo: boolean): string | null | undefined {
  if (!isWeatherApiPath(path)) return undefined;
  if (!isByo) return undefined;
  return getRuntimeByoWeatherEndpoint();
}

export class ByoWeatherNotConfiguredError extends Error {
  constructor() {
    super(
      'This farm has not set up its own weather function. PUF-AM will not use the PUFworks weather API.'
    );
    this.name = 'ByoWeatherNotConfiguredError';
  }
}
