import { createHash, randomBytes } from 'node:crypto';
import type { FarmModuleId } from '../shared/auth/farmModules.ts';
import { exhaustedInviteMessage } from '../shared/auth/inviteLimits.ts';

const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export type AccessPinRole = 'admin' | 'farmer' | 'viewer';

export interface AccessPinRecord {
  farmId: string;
  role: AccessPinRole;
  /** Admin-facing name for this invite (set at mint / preset pinLabel). */
  label: string;
  active: boolean;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  /** Modules granted on redeem (admins ignore and get all). */
  modules?: FarmModuleId[];
  /** Present for audit only — never store plaintext code */
  codeHint?: string;
  /**
   * Set on first redeem for roles that bind (admin). Once present, only this
   * uid may redeem the PIN again — see shared/auth/inviteLimits.
   */
  claimedBy?: string | null;
  claimedDisplayName?: string | null;
  lastRedeemedAt?: string | null;
  lastRedeemedBy?: string | null;
  /** Display name entered on last redeem (helps admins pick which PIN to revoke). */
  lastRedeemedDisplayName?: string | null;
  /** Each successful redeem. Same uid is the same name; a new uid is another person. */
  redemptions?: PinRedemption[];
  /** `${uid}|${userAgent}` slots. A repeat of one slot does not spend another use. */
  deviceKeys?: string[];
  /** Shared by a PIN and the replacement issued when its device cap was used up. */
  linkId?: string | null;
  /** Replacement PINs reopen this account when the typed name matches. */
  heldForUid?: string | null;
  heldForDisplayName?: string | null;
}

export type PinRedemption = {
  at: string;
  uid: string;
  displayName: string;
  ip: string | null;
  userAgent: string | null;
};

/**
 * Same uid on more than one IP or browser is one account on several devices.
 * More than one uid means the code was redeemed under different names.
 */
export function summarizePinUses(rows: PinRedemption[]): string {
  if (rows.length === 0) return 'No device log yet';
  const accounts = new Set(rows.map((row) => row.uid));
  if (accounts.size > 1) {
    return `${accounts.size} different accounts — this code was used by more than one person`;
  }
  const devices = new Set(rows.map((row) => `${row.ip || ''}|${row.userAgent || ''}`));
  if (devices.size > 1) return `Same account on ${devices.size} devices`;
  return 'Same account, one device';
}

export function newFarmId(): string {
  return `farm_${randomBytes(8).toString('hex')}`;
}

export function normalizePin(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function hashPin(pin: string): string {
  return createHash('sha256').update(normalizePin(pin), 'utf8').digest('hex');
}

export function generatePinCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PIN_ALPHABET[bytes[i]! % PIN_ALPHABET.length];
  }
  return out;
}

export function pinDocId(pin: string): string {
  return hashPin(pin);
}

export function uidForPinRedeem(pin: string, displayName: string): string {
  const key = `${normalizePin(pin)}:${displayName.trim().toLowerCase()}`;
  const digest = createHash('sha256').update(key, 'utf8').digest('hex');
  return `ap_${digest.slice(0, 20)}`;
}

export function syntheticEmail(uid: string): string {
  return `${uid}@sentinut.local`;
}

export function isPinExpired(record: AccessPinRecord, now = new Date()): boolean {
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt).getTime() < now.getTime();
}

export function canRedeemPin(record: AccessPinRecord): { ok: true } | { ok: false; reason: string } {
  if (!record.active) return { ok: false, reason: 'This invite PIN has been revoked.' };
  if (isPinExpired(record)) return { ok: false, reason: 'This invite PIN has expired.' };
  if (record.maxUses != null && record.useCount >= record.maxUses) {
    return { ok: false, reason: exhaustedInviteMessage(record) };
  }
  return { ok: true };
}
