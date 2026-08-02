/**
 * Secure-context guard for Web Crypto `subtle` (AES-GCM, PBKDF2 session wrap).
 * HKDF / FarmCode derivation uses pure JS and does not need this.
 */

const SUBTLE_UNAVAILABLE =
  'Web Crypto (crypto.subtle) is unavailable in this browser context. ' +
  'Open via http://localhost:3000 on this machine (not a LAN IP) or use HTTPS. ' +
  'FarmCode validation works without it; session encryption does not.';

/** Returns `crypto.subtle` or throws an actionable error (non-secure context / LAN HTTP). */
export function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(SUBTLE_UNAVAILABLE);
  }
  return subtle;
}

/** True when AES-GCM session wrap can run in this context. */
export function hasSubtleCrypto(): boolean {
  return Boolean(globalThis.crypto?.subtle);
}
