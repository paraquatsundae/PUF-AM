/**
 * Server-only secrets. Never use a VITE_ prefix for keys that must stay off the client bundle.
 */

let warnedLegacyDpird = false;

/** DPIRD weather API key — server / Cloud Functions only. */
export function getDpirdApiKey(): string | undefined {
  const primary = process.env.DPIRD_API_KEY?.trim();
  if (primary && primary !== 'YOUR_DPIRD_API_KEY') return primary;

  const legacy = process.env.VITE_DPIRD_API_KEY?.trim();
  if (legacy && legacy !== 'YOUR_DPIRD_API_KEY') {
    if (!warnedLegacyDpird) {
      warnedLegacyDpird = true;
      console.warn(
        '[Server] VITE_DPIRD_API_KEY is deprecated and can leak into client builds. ' +
          'Use DPIRD_API_KEY in .env instead (and remove the VITE_ line).'
      );
    }
    return legacy;
  }
  return undefined;
}
