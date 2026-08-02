/**
 * FarmSeed / FarmId derivation (mist-v1) via HKDF-SHA-256 (Web Crypto).
 * @see Plans/MIST_NETWORK_STORAGE.md § Invitation
 */

export const MIST_HKDF_SALT = 'pufam-mist-v1';

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HKDF-SHA-256 expand; returns `length` bytes. */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: string,
  info: string,
  length: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(salt),
      info: enc.encode(info),
    },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** FarmSeed = HKDF(FarmCode_bytes, salt, info="farm-seed") — 32 bytes. */
export async function deriveFarmSeed(farmCodeBytes: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(farmCodeBytes, MIST_HKDF_SALT, 'farm-seed', 32);
}

/** FarmId = first 16 bytes of HKDF(FarmSeed, info="farm-id") as hex (public handle). */
export async function deriveFarmId(farmSeed: Uint8Array): Promise<string> {
  const idBytes = await hkdfSha256(farmSeed, MIST_HKDF_SALT, 'farm-id', 16);
  return toHex(idBytes);
}

export { toHex as bytesToHex };

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '').toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
