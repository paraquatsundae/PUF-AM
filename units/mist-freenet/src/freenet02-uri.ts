/**
 * Freenet 0.2 URI scheme for mist pack-contract instances.
 *
 * Freenet 0.2 addresses immutable pack contracts as
 *   FN02@<base58-contract-instance-id>
 * (`CHK@…` is the Hyphanet-era form; `freenet-uri-normalize.ts` still accepts
 * it so an old index entry parses, but nothing publishes one any more.)
 *
 * The instance id is the Freenet contract key (BLAKE3(BLAKE3(wasm) || blake3(blob))).
 */

export const FREENET02_URI_PREFIX = 'FN02@';

export function encodeFreenet02Uri(instanceIdBase58: string): string {
  return `${FREENET02_URI_PREFIX}${instanceIdBase58}`;
}

export function parseFreenet02Uri(uri: string): string | null {
  if (!uri.startsWith(FREENET02_URI_PREFIX)) return null;
  const id = uri.slice(FREENET02_URI_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function isFreenet02Uri(uri: string): boolean {
  return parseFreenet02Uri(uri) !== null;
}
