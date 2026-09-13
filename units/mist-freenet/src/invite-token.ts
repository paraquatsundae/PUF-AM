/**
 * Crew InviteToken — longer than the 40-bit `PUF-XXXX-XXXX` pointer.
 *
 * FarmSeed must never ride on eight Crockford symbols. A crew invite is 128 bits
 * (26 symbols after `PUF-`) so it can locate a public join envelope and unwrap
 * Hot/Bones keys without making an overheard short ticket equal the farm.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 * @see Plans/LOGIN_JOIN_SINGLE_BOX.md Decision — 2026-09-12
 */

import { CROCKFORD_ALPHABET, normalizeCrockfordChar } from './crockford.ts';

/** Same prefix as the short ticket so the join box routes `PUF-…` to crew. */
export const INVITE_TOKEN_PREFIX = 'PUF';

/** Legacy 8-symbol pointer — not an InviteToken, cannot unwrap FarmSeed. */
const SHORT_TICKET_SYMBOLS = 8;

/** 26 Crockford symbols = 130 bits of encoding for a 128-bit InviteId. */
export const INVITE_TOKEN_SYMBOLS = 26;

/** Hyphen every 4 symbols: `PUF-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX`. */
export const INVITE_TOKEN_GROUP = 4;

const INVITE_TOKEN_BYTES = 16;

export type PufTokenKind = 'invite-token' | 'short-ticket';

export type NormalizedPufToken = {
  kind: PufTokenKind;
  canonical: string;
};

function groupBody(body: string, group = INVITE_TOKEN_GROUP): string {
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += group) {
    groups.push(body.slice(i, i + group));
  }
  return groups.join('-');
}

function foldBody(body: string): string | null {
  let normalized = '';
  for (const ch of body) {
    const symbol = normalizeCrockfordChar(ch);
    if (!CROCKFORD_ALPHABET.includes(symbol)) return null;
    normalized += symbol;
  }
  return normalized;
}

function cleanedAlnum(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

function bodyFromCleaned(cleaned: string, symbolCount: number): string | null {
  if (!cleaned) return null;
  const body =
    cleaned.length === symbolCount + INVITE_TOKEN_PREFIX.length &&
    cleaned.startsWith(INVITE_TOKEN_PREFIX)
      ? cleaned.slice(INVITE_TOKEN_PREFIX.length)
      : cleaned;
  if (body.length !== symbolCount) return null;
  return foldBody(body);
}

/** Operator-facing InviteToken. */
export function formatInviteTokenCode(body: string): string {
  return `${INVITE_TOKEN_PREFIX}-${groupBody(body)}`;
}

/**
 * Live input format for a crew invite. Caps at 26 body symbols. A gloved thumb
 * only types the symbols; prefix and hyphens appear on their own.
 */
export function formatInviteTokenInput(raw: string): string {
  const cleaned = cleanedAlnum(raw);
  if (!cleaned) return '';
  if (INVITE_TOKEN_PREFIX.startsWith(cleaned)) return cleaned;
  const body = (
    cleaned.startsWith(INVITE_TOKEN_PREFIX) ? cleaned.slice(INVITE_TOKEN_PREFIX.length) : cleaned
  ).slice(0, INVITE_TOKEN_SYMBOLS);
  return `${INVITE_TOKEN_PREFIX}-${groupBody(body)}`;
}

/** Canonical `PUF-` + 26 symbols, or `null`. */
export function normalizeInviteToken(raw: string): string | null {
  const body = bodyFromCleaned(cleanedAlnum(raw), INVITE_TOKEN_SYMBOLS);
  if (!body) return null;
  return formatInviteTokenCode(body);
}

export function isInviteToken(raw: string): boolean {
  return normalizeInviteToken(raw) !== null;
}

function normalizeShortTicketLocal(raw: string): string | null {
  const body = bodyFromCleaned(cleanedAlnum(raw), SHORT_TICKET_SYMBOLS);
  if (!body) return null;
  return `${INVITE_TOKEN_PREFIX}-${groupBody(body)}`;
}

/**
 * Any `PUF-` token: InviteToken-class first, then the legacy 8-symbol pointer.
 * A short ticket is never treated as an InviteToken.
 */
export function normalizePufToken(raw: string): NormalizedPufToken | null {
  const invite = normalizeInviteToken(raw);
  if (invite) return { kind: 'invite-token', canonical: invite };
  const short = normalizeShortTicketLocal(raw);
  if (short) return { kind: 'short-ticket', canonical: short };
  return null;
}

export function mintInviteToken(
  randomBytes: (length: number) => Uint8Array = defaultRandomBytes,
): string {
  const bytes = randomBytes(INVITE_TOKEN_BYTES);
  let bits = 0;
  let value = 0;
  let body = '';
  for (const byte of bytes.slice(0, INVITE_TOKEN_BYTES)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      body += CROCKFORD_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    body += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return formatInviteTokenCode(body.slice(0, INVITE_TOKEN_SYMBOLS));
}

/** 16-byte InviteId recovered from a canonical InviteToken. */
export function inviteTokenBytes(canonical: string): Uint8Array {
  const normalized = normalizeInviteToken(canonical);
  if (!normalized) {
    throw new Error('inviteTokenBytes: not an InviteToken');
  }
  const body = normalized.replace(/[^0-9A-Z]/g, '').slice(INVITE_TOKEN_PREFIX.length);
  const out = new Uint8Array(INVITE_TOKEN_BYTES);
  let bits = 0;
  let value = 0;
  let written = 0;
  for (const ch of body) {
    const symbol = normalizeCrockfordChar(ch);
    const idx = CROCKFORD_ALPHABET.indexOf(symbol);
    if (idx < 0) throw new Error('inviteTokenBytes: invalid symbol');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8 && written < INVITE_TOKEN_BYTES) {
      bits -= 8;
      out[written] = (value >>> bits) & 0xff;
      written += 1;
    }
  }
  if (written !== INVITE_TOKEN_BYTES) {
    throw new Error('inviteTokenBytes: could not recover 16 bytes');
  }
  return out;
}

function defaultRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!webcrypto?.getRandomValues) {
    throw new Error('Secure randomness unavailable — cannot mint a crew invite');
  }
  webcrypto.getRandomValues(out);
  return out;
}

/** Short 8-symbol tickets are pointers, not a FarmSeed unwrap. */
export function shortTicketCannotUnwrapFarmSeed(raw: string): boolean {
  return normalizePufToken(raw)?.kind !== 'invite-token';
}
