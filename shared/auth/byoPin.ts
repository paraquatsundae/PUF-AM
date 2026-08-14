/**
 * Browser-safe PIN helpers for bring-your-own Firebase.
 *
 * Same alphabet and SHA-256 as `server/accessPinCrypto.ts`, but uses Web Crypto
 * so the login wizard never imports Node. Return login is email+password
 * derived from PIN + display name — no Admin SDK, no custom tokens.
 *
 * @see Plans/FIREBASE_BILLING.md §3.2 #1 (c)
 */

export const BYO_PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const BYO_AUTH_EMAIL_DOMAIN = 'byo.pufam.invalid';
export const BYO_JOIN_TICKETS = 'join_tickets';

export function normalizePin(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string): Promise<string> {
  return sha256Hex(normalizePin(pin));
}

export function generatePinCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BYO_PIN_ALPHABET[bytes[i]! % BYO_PIN_ALPHABET.length];
  }
  return out;
}

export function newFarmId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `farm_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function pinCodeHint(pin: string): string {
  const n = normalizePin(pin);
  if (n.length < 4) return '••••';
  return `${n.slice(0, 2)}••••${n.slice(-2)}`;
}

export async function byoAuthCredentials(
  pin: string,
  displayName: string
): Promise<{ email: string; password: string }> {
  const name = displayName.trim().toLowerCase();
  if (name.length < 2) throw new Error('Enter your name (at least 2 characters).');
  const digest = await sha256Hex(`${normalizePin(pin)}:${name}`);
  return {
    email: `ap_${digest.slice(0, 20)}@${BYO_AUTH_EMAIL_DOMAIN}`,
    password: `pufam-byo-v1.${digest}`,
  };
}

export function isByoAuthEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${BYO_AUTH_EMAIL_DOMAIN}`);
}

export function canRedeemJoinTicket(
  record: {
    active: boolean;
    maxUses: number | null;
    useCount: number;
    expiresAt: string | null;
  },
  now = new Date()
): { ok: true } | { ok: false; reason: string } {
  if (!record.active) return { ok: false, reason: 'This invite PIN has been revoked.' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() < now.getTime()) {
    return { ok: false, reason: 'This invite PIN has expired.' };
  }
  if (record.maxUses != null && record.useCount >= record.maxUses) {
    return { ok: false, reason: 'This invite PIN has no uses left.' };
  }
  return { ok: true };
}
