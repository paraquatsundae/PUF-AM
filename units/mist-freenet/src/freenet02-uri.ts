/**
 * Freenet 0.2 URI scheme for mist pack-contract instances.
 *
 * Legacy FCP uses `CHK@…`; 0.2 uses immutable pack contracts:
 *   FN02@<base58-contract-instance-id>
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
