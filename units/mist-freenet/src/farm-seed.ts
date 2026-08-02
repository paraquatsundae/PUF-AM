/**
 * FarmSeed / FarmId derivation (mist-v1) via HKDF-SHA-256.
 * Pure JS (RFC 5869) so FarmCode works on LAN HTTP without a secure context.
 * @see Plans/MIST_NETWORK_STORAGE.md § Invitation
 */

import { hmacSha256 } from './hash.ts';

export const MIST_HKDF_SALT = 'pufam-mist-v1';

const HKDF_HASH_LEN = 32;

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Uint8Array {
  const s = salt.length > 0 ? salt : new Uint8Array(HKDF_HASH_LEN);
  return hmacSha256(s, ikm);
}

function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  const n = Math.ceil(length / HKDF_HASH_LEN);
  const out = new Uint8Array(length);
  let t = new Uint8Array(0);
  let pos = 0;

  for (let i = 1; i <= n; i++) {
    t = hmacSha256(prk, concat(t, info, new Uint8Array([i])));
    const copyLen = Math.min(HKDF_HASH_LEN, length - pos);
    out.set(t.subarray(0, copyLen), pos);
    pos += copyLen;
  }

  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** HKDF-SHA-256 expand; returns `length` bytes (matches Web Crypto HKDF). */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: string,
  info: string,
  length: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const prk = hkdfExtract(enc.encode(salt), ikm);
  return hkdfExpand(prk, enc.encode(info), length);
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
