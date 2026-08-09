/**
 * The unlocked FarmSeed, for as long as this tab lives.
 *
 * Every route into a farm — boot restore, the device PIN gate, FarmCode
 * recovery, a join ticket — ends in `loadMistDeviceSession`, so that is where
 * the seed is handed over. Publishing then costs no second unlock, which is
 * what "unlocked" has always meant on screen: a device showing the farm can
 * send it.
 *
 * Memory only, and deliberately not exported to anything that persists. The
 * AES-GCM blob in `localStorage` stays the only copy at rest.
 */

import { hexToBytes } from '../../units/mist-freenet/src/farm-seed.ts';

let cachedFarmSeed: Uint8Array | null = null;

/** Called on every successful session decrypt — see `loadMistDeviceSession`. */
export function rememberUnlockedFarmSeed(farmSeedHex: string): void {
  cachedFarmSeed = hexToBytes(farmSeedHex);
}

export function unlockedFarmSeed(): Uint8Array | null {
  return cachedFarmSeed;
}

/** True when a publish can run without asking for a device PIN. */
export function isMistFarmSeedUnlocked(): boolean {
  return cachedFarmSeed !== null;
}

/** Sign-out, and anywhere else the farm should stop being open. */
export function forgetUnlockedFarmSeed(): void {
  cachedFarmSeed = null;
}
