import { createHash, randomBytes } from 'node:crypto';
import type { FarmModuleId } from '../shared/auth/farmModules.ts';

const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export type AccessPinRole = 'admin' | 'farmer' | 'viewer';

export interface AccessPinRecord {
  farmId: string;
  role: AccessPinRole;
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
    return { ok: false, reason: 'This invite PIN has no uses left.' };
  }
  return { ok: true };
}
