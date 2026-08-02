/**
 * Shared mist first-run / recovery finish — persist session, open IndexedDB store, enter app.
 */

import { setFarmStoreBackend } from './farmStoreBackend.ts';
import {
  createMistSessionRecord,
  saveMistDeviceSession,
} from './mistDeviceSession.ts';
import { createAppFarmStore } from './createFarmStore.ts';

export async function finishMistFarmSetup(input: {
  farmId: string;
  farmName: string;
  displayName: string;
  farmSeed: Uint8Array;
  skipPin: boolean;
  devicePin?: string;
}): Promise<void> {
  setFarmStoreBackend('mist');

  const session = createMistSessionRecord({
    farmId: input.farmId,
    farmName: input.farmName.trim(),
    displayName: input.displayName.trim(),
    farmSeed: input.farmSeed,
    devicePin: input.skipPin ? undefined : input.devicePin,
  });

  await saveMistDeviceSession(session, input.skipPin ? undefined : input.devicePin);
  await createAppFarmStore(input.farmId);

  window.location.href = '/farm-setup';
}
