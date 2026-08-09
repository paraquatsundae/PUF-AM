/**
 * Unlocking once has to be enough to send.
 *
 * "Mist device session locked — unlock to publish Hot" met every operator who
 * pressed Send on a PIN-protected laptop: the gate had decrypted the session,
 * the app was showing the farm, and the publish path then went looking for a
 * FarmSeed that nobody had kept. Both halves of that are pinned here — the seed
 * survives an unlock, and the Send card can tell when it genuinely has to ask.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMistDeviceSession,
  createMistSessionRecord,
  loadMistDeviceSession,
  saveMistDeviceSession,
} from './mistDeviceSession.ts';
import { forgetUnlockedFarmSeed, isMistFarmSeedUnlocked } from './mistFarmSeedCache.ts';
import { mistPublishNeedsDevicePin, resolveMistFarmSeed } from './mistHotBridge.ts';

const mockStorage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mockStorage.set(k, v);
  },
  removeItem: (k: string) => {
    mockStorage.delete(k);
  },
  clear: () => mockStorage.clear(),
  key: () => null,
  length: 0,
});

const SEED = new Uint8Array(32).fill(7);
const SEED_HEX = '07'.repeat(32);

async function savePinSession(pin: string): Promise<void> {
  await saveMistDeviceSession(
    createMistSessionRecord({
      farmId: 'a'.repeat(32),
      farmName: 'PIN Farm',
      displayName: 'Alice',
      farmSeed: SEED,
      devicePin: pin,
    }),
    pin,
  );
  // Saving is not unlocking: start every case from a device that has only the
  // sealed blob, which is what a relaunched AppImage has.
  forgetUnlockedFarmSeed();
}

describe('mist FarmSeed unlock', () => {
  afterEach(() => {
    mockStorage.clear();
    clearMistDeviceSession();
    forgetUnlockedFarmSeed();
  });

  it('publishes without a PIN after the unlock gate opened the session', async () => {
    await savePinSession('1234');
    expect(mistPublishNeedsDevicePin()).toBe(true);

    // What `AuthContext.applyMistSession` does when the operator types the PIN.
    expect(await loadMistDeviceSession('1234')).not.toBeNull();

    expect(isMistFarmSeedUnlocked()).toBe(true);
    expect(mistPublishNeedsDevicePin()).toBe(false);
    expect(await resolveMistFarmSeed()).toEqual(SEED);
  });

  it('has no seed to publish with before anything unlocks a sealed session', async () => {
    await savePinSession('1234');

    expect(await resolveMistFarmSeed()).toBeNull();
    expect(mistPublishNeedsDevicePin()).toBe(true);
  });

  it('takes a device PIN at the publish itself, for a card that had to ask', async () => {
    await savePinSession('1234');

    expect(await resolveMistFarmSeed('9999')).toBeNull();
    expect(await resolveMistFarmSeed('1234')).toEqual(SEED);
    expect(mistPublishNeedsDevicePin()).toBe(false);
  });

  it('never asks a PIN-less session for a PIN', async () => {
    await saveMistDeviceSession(
      createMistSessionRecord({
        farmId: 'b'.repeat(32),
        farmName: 'Workshop Farm',
        displayName: 'Bob',
        farmSeed: SEED,
      }),
    );
    forgetUnlockedFarmSeed();

    expect(mistPublishNeedsDevicePin()).toBe(false);
    expect(await resolveMistFarmSeed()).toEqual(SEED);
  });

  it('forgets the seed on sign-out', async () => {
    await savePinSession('1234');
    const session = await loadMistDeviceSession('1234');
    expect(session?.farmSeedHex).toBe(SEED_HEX);

    clearMistDeviceSession();

    expect(isMistFarmSeedUnlocked()).toBe(false);
    expect(await resolveMistFarmSeed()).toBeNull();
  });
});
