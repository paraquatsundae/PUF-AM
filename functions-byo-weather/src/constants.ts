/** Gen2 region — same as hosted Cloud Run, closest to WA. */
export const BYO_WEATHER_REGION = 'australia-southeast1';

/**
 * George's hosted Firebase. This package must never deploy there — that would
 * put a third-party DPIRD key (or a confused owner's secret) on PUFworks infra.
 */
export const PUFWORKS_HOSTED_PROJECT_ID = 'gen-lang-client-0444791425';

export const WEATHER_MAX_CALLS = 60;
export const WEATHER_WINDOW_MS = 15 * 60 * 1000;

/** Cap hourly DPIRD spend if a project accumulates many cache docs. */
export const MAX_REFRESH_STATIONS = 8;

export const DEFAULT_CORS_ORIGINS = [
  'https://am.pufworks.farm',
  'https://pufom-quby5ye5pa-ts.a.run.app',
];

export function allowedCorsOrigins(): Set<string> {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_CORS_ORIGINS);
}

export function isLanClientOrigin(origin: string): boolean {
  return (
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('http://localhost:') ||
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost'
  );
}
