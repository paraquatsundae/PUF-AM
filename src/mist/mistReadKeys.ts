/**
 * In-memory Hot/Bones keys after unlock. Never persists FarmSeed for crew.
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 */

export type MistReadKeys = {
  hotKey: Uint8Array;
  bonesKey: Uint8Array;
  /** Present only on owner devices. */
  farmSeed?: Uint8Array;
};

let cached: MistReadKeys | null = null;

export function rememberUnlockedReadKeys(keys: MistReadKeys): void {
  cached = keys;
}

export function unlockedReadKeys(): MistReadKeys | null {
  return cached;
}

export function forgetUnlockedReadKeys(): void {
  cached = null;
}

export function sessionHasFarmSeed(session: { farmSeedHex?: string } | null): boolean {
  return Boolean(session?.farmSeedHex && session.farmSeedHex.length === 64);
}
