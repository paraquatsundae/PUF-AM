/**
 * Farm-scoped mist storage key conventions (mist-v1).
 *
 * These are opaque storage paths for the MistStore contract — not Firestore
 * paths and not raw HKDF contract key bytes. HKDF labels (`freenet-hot`, …)
 * live in Plans/MIST_NETWORK_STORAGE.md § Invitation.
 */

import { MIST_KINDS, type MistKind } from './types.ts';

export const MIST_KEY_VERSION = 'mist/v1';

export type ParsedMistKey = {
  farmId: string;
  kind: MistKind;
  /** Remaining path segments after kind (asset id, period, segment, …). */
  segments: string[];
};

/** Prefix for all keys belonging to one farm. */
export function farmKeyPrefix(farmId: string): string {
  return `${MIST_KEY_VERSION}/farm/${farmId}`;
}

/** Farm structure asset (boundaries, tiles, static features). */
export function bonesKey(farmId: string, assetId: string): string {
  return `${farmKeyPrefix(farmId)}/bones/${assetId}`;
}

/** Hot contract — default segment `current` (90-day rolling window in v1). */
export function hotKey(farmId: string, segment = 'current'): string {
  return `${farmKeyPrefix(farmId)}/hot/${segment}`;
}

/** Sealed archive contract for a calendar period (e.g. `"2026"`). */
export function archiveKey(farmId: string, period: string): string {
  return `${farmKeyPrefix(farmId)}/archive/${period}`;
}

/** Manifest index (hot + archive pointers). */
export function manifestKey(farmId: string): string {
  return `${farmKeyPrefix(farmId)}/manifest`;
}

/** List prefix for all entries of one kind on a farm. */
export function kindPrefix(farmId: string, kind: MistKind): string {
  return `${farmKeyPrefix(farmId)}/${kind}`;
}

/** True when `key` is under `prefix` (prefix match on path segments). */
export function keyMatchesPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

/** Parse a mist key; returns null if the string is not a valid mist-v1 key. */
export function parseMistKey(key: string): ParsedMistKey | null {
  const parts = key.split('/');
  if (parts.length < 5) return null;
  if (parts[0] !== 'mist' || parts[1] !== 'v1' || parts[2] !== 'farm') return null;

  const farmId = parts[3];
  const kind = parts[4];
  if (!farmId || !(MIST_KINDS as readonly string[]).includes(kind)) return null;

  return {
    farmId,
    kind: kind as MistKind,
    segments: parts.slice(5),
  };
}
