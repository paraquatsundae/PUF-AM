/**
 * Crockford Base32 (mist-v1) — browser-safe encode/decode + optional check symbol.
 * @see Plans/MIST_NETWORK_STORAGE.md § FarmCode encoding
 */

/** 32-symbol encoding alphabet (no I, L, O, U). */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 37-symbol check alphabet (encoding alphabet + * ~ $ = U). */
export const CROCKFORD_CHECK_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U';

/** Normalize ambiguous characters on decode (Crockford convention). */
export function normalizeCrockfordChar(c: string): string {
  const u = c.toUpperCase();
  if (u === 'O') return '0';
  if (u === 'I' || u === 'L') return '1';
  if (u === 'U') return 'V';
  return u;
}

/** Decode one Crockford symbol to 0–31; throws on invalid input. */
export function decodeCrockfordSymbol(c: string): number {
  const n = normalizeCrockfordChar(c);
  const idx = CROCKFORD_ALPHABET.indexOf(n);
  if (idx === -1) {
    throw new Error(`Invalid Crockford symbol: ${c}`);
  }
  return idx;
}

/** Encode bytes to Crockford Base32 (no padding). */
export function encodeCrockfordBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    out += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode Crockford Base32 string to bytes. */
export function decodeCrockfordBase32(encoded: string): Uint8Array {
  const clean = encoded.replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | decodeCrockfordSymbol(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Compute Crockford check symbol over payload symbols (26 chars for FarmCode). */
export function crockfordCheckSymbol(payload: string): string {
  let chk = 0;
  for (const ch of payload) {
    chk = (chk * 32 + decodeCrockfordSymbol(ch)) % 37;
  }
  return CROCKFORD_CHECK_ALPHABET[(37 - chk) % 37]!;
}

/** Verify check symbol matches payload. */
export function verifyCrockfordCheck(payload: string, check: string): boolean {
  const expected = crockfordCheckSymbol(payload);
  const normalizedCheck = normalizeCrockfordChar(check);
  const idx = CROCKFORD_CHECK_ALPHABET.indexOf(normalizedCheck);
  if (idx === -1) return false;
  return CROCKFORD_CHECK_ALPHABET[idx] === expected;
}

/** Insert hyphens every 5 symbols; last group may be shorter (FarmCode: …-XX). */
export function groupCrockfordBody(body: string): string {
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += 5) {
    groups.push(body.slice(i, i + 5));
  }
  return groups.join('-');
}
