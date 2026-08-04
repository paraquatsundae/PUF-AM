/**
 * Short join tickets — the phone-friendly half of the two-laptop farm join.
 *
 * The FN02 join ticket that shipped first is a JSON blob of two contract URIs.
 * It works on a laptop with a clipboard and fails on a phone read off a
 * whiteboard, which is the handoff that actually happens in a shed. So the
 * thing an operator carries is now eight Crockford symbols — `PUF-K7M2-9Q4X` —
 * and the URIs live in a manifest the owner's hub hands out when that ticket is
 * presented.
 *
 * A ticket is a **capability, not a secret that unlocks anything**: whoever
 * holds it can learn where a farm's Hot and bones blobs sit on Freenet. Those
 * blobs are AEAD sealed under a FarmSeed-derived key, so the ticket is useless
 * without the FarmCode. It replaces a copy/paste, not the recovery key.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Short join ticket
 */

import {
  CROCKFORD_ALPHABET,
  normalizeCrockfordChar,
} from '../../units/mist-freenet/src/crockford.ts';

/** Human prefix so a ticket is recognisable written on a whiteboard. */
export const JOIN_TICKET_PREFIX = 'PUF';

/** 8 Crockford symbols = 40 bits — short enough to read aloud, wide enough that guessing is hopeless. */
export const JOIN_TICKET_SYMBOLS = 8;

/** Hyphen every 4 symbols: `PUF-K7M2-9Q4X`. */
export const JOIN_TICKET_GROUP = 4;

const JOIN_TICKET_BYTES = 5;

/** Roles a join manifest may grant. `owner` sits above the Firebase `FarmRole` vocab. */
export const JOIN_ROLES = ['owner', 'admin', 'farmer', 'viewer'] as const;

export type JoinRole = (typeof JOIN_ROLES)[number];

/**
 * What a shared ticket grants unless the owner picks otherwise. A farmer can
 * write diary and issues but is not handed the farm's setup wizard.
 */
export const DEFAULT_JOIN_ROLE: JoinRole = 'farmer';

export function isJoinRole(value: unknown): value is JoinRole {
  return typeof value === 'string' && (JOIN_ROLES as readonly string[]).includes(value);
}

export function coerceJoinRole(value: unknown): JoinRole {
  return isJoinRole(value) ? value : DEFAULT_JOIN_ROLE;
}

/**
 * Join manifest v2 — what a ticket resolves to.
 *
 * `permissions` is deliberately open: the four role names will not survive
 * contact with real crews, and a v2 manifest that already carries a bag of
 * grants means the next step is not a v3 wire format.
 */
export type JoinManifestV2 = {
  v: 2;
  farmId: string;
  hotUri: string;
  bonesUri: string;
  role: JoinRole;
  /** Reserved for per-capability grants (bitflags or named booleans) in a later pass. */
  permissions?: Record<string, boolean | number | string>;
  /** ISO timestamp after which a hub must refuse to serve this manifest. */
  expires?: string;
  /** Canonical `PUF-XXXX-XXXX` form of the ticket that resolves to this manifest. */
  ticket: string;
  hotContentHash?: string;
  bonesContentHash?: string;
};

function groupTicketBody(body: string): string {
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += JOIN_TICKET_GROUP) {
    groups.push(body.slice(i, i + JOIN_TICKET_GROUP));
  }
  return groups.join('-');
}

/** Wrap a bare 8-symbol body in the prefix + hyphens operators actually see. */
export function formatJoinTicketCode(body: string): string {
  return `${JOIN_TICKET_PREFIX}-${groupTicketBody(body)}`;
}

/**
 * Normalize whatever an operator typed into the canonical `PUF-XXXX-XXXX` form,
 * or `null` if it cannot be one. Crockford's substitutions apply, so a ticket
 * read as `O` / `I` / `L` still lands on `0` / `1` / `1`.
 */
export function normalizeJoinTicket(raw: string): string | null {
  const cleaned = String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (!cleaned) return null;

  // The prefix contains `U`, which Crockford would fold to `V` — strip it first.
  const body =
    cleaned.length === JOIN_TICKET_SYMBOLS + JOIN_TICKET_PREFIX.length &&
    cleaned.startsWith(JOIN_TICKET_PREFIX)
      ? cleaned.slice(JOIN_TICKET_PREFIX.length)
      : cleaned;

  if (body.length !== JOIN_TICKET_SYMBOLS) return null;

  let normalized = '';
  for (const ch of body) {
    const symbol = normalizeCrockfordChar(ch);
    if (!CROCKFORD_ALPHABET.includes(symbol)) return null;
    normalized += symbol;
  }

  return formatJoinTicketCode(normalized);
}

export function isJoinTicket(raw: string): boolean {
  return normalizeJoinTicket(raw) !== null;
}

/** Mint a fresh ticket. `randomBytes` is injectable so tests can be deterministic. */
export function mintJoinTicket(
  randomBytes: (length: number) => Uint8Array = defaultRandomBytes,
): string {
  const bytes = randomBytes(JOIN_TICKET_BYTES);
  let bits = 0;
  let value = 0;
  let body = '';
  for (const byte of bytes.slice(0, JOIN_TICKET_BYTES)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      body += CROCKFORD_ALPHABET[(value >>> bits) & 31];
    }
  }
  return formatJoinTicketCode(body);
}

function defaultRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!webcrypto?.getRandomValues) {
    throw new Error('Secure randomness unavailable — cannot mint a join ticket');
  }
  webcrypto.getRandomValues(out);
  return out;
}

function sanitizePermissions(
  value: unknown,
): Record<string, boolean | number | string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, boolean | number | string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'boolean' || typeof raw === 'number' || typeof raw === 'string') {
      out[key] = raw;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Validate an untrusted manifest (HTTP body, LAN peer response) into a `JoinManifestV2`. */
export function parseJoinManifestV2(value: unknown): JoinManifestV2 | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (o.v !== 2) return null;

  const ticket = typeof o.ticket === 'string' ? normalizeJoinTicket(o.ticket) : null;
  const farmId = typeof o.farmId === 'string' ? o.farmId.trim() : '';
  const hotUri = typeof o.hotUri === 'string' ? o.hotUri.trim() : '';
  const bonesUri = typeof o.bonesUri === 'string' ? o.bonesUri.trim() : '';
  if (!ticket || !farmId || !hotUri || !bonesUri) return null;

  const expires =
    typeof o.expires === 'string' && Number.isFinite(Date.parse(o.expires))
      ? new Date(o.expires).toISOString()
      : undefined;
  const permissions = sanitizePermissions(o.permissions);

  return {
    v: 2,
    farmId,
    hotUri,
    bonesUri,
    role: coerceJoinRole(o.role),
    ...(permissions ? { permissions } : {}),
    ...(expires ? { expires } : {}),
    ticket,
    ...(typeof o.hotContentHash === 'string' && o.hotContentHash.trim()
      ? { hotContentHash: o.hotContentHash.trim() }
      : {}),
    ...(typeof o.bonesContentHash === 'string' && o.bonesContentHash.trim()
      ? { bonesContentHash: o.bonesContentHash.trim() }
      : {}),
  };
}

export function isJoinManifestExpired(manifest: JoinManifestV2, now = Date.now()): boolean {
  if (!manifest.expires) return false;
  const at = Date.parse(manifest.expires);
  return Number.isFinite(at) && at <= now;
}

/** How long a freshly minted ticket stays resolvable unless the owner says otherwise. */
export const JOIN_TICKET_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function defaultJoinTicketExpiry(now = Date.now()): string {
  return new Date(now + JOIN_TICKET_DEFAULT_TTL_MS).toISOString();
}
