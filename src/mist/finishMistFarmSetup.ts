/**
 * Shared mist first-run / recovery finish — persist session, open IndexedDB store, enter app.
 */

import { setFarmStoreBackend } from './farmStoreBackend.ts';
import {
  createMistSessionRecord,
  saveMistDeviceSession,
  type MistSessionRole,
} from './mistDeviceSession.ts';
import { createAppFarmStore } from './createFarmStore.ts';

/**
 * Only the operator who minted the farm gets marched through the geometry and
 * infrastructure wizard. A joiner's blocks, dryers, and water rights arrive with
 * the farm over Freenet, so sending them to `/farm-setup` would invite them to
 * fill in fields that are about to be overwritten.
 */
export function mistSetupDestination(input: {
  role: MistSessionRole;
  joinedViaTicket?: boolean;
  joinTicketPending?: boolean;
}): string {
  if (input.joinedViaTicket || input.joinTicketPending) return '/';
  return input.role === 'owner' ? '/farm-setup' : '/';
}

export async function finishMistFarmSetup(input: {
  farmId: string;
  farmName: string;
  displayName: string;
  farmSeed: Uint8Array;
  skipPin: boolean;
  devicePin?: string;
  /** `owner` when minting a farm; the manifest's role once a ticket is accepted. */
  role?: MistSessionRole;
  joinedViaTicket?: boolean;
  /** Blocks the app on "Enter join ticket" until the farm data arrives. */
  joinTicketPending?: boolean;
}): Promise<void> {
  setFarmStoreBackend('mist');

  const role: MistSessionRole = input.role ?? 'owner';

  const session = createMistSessionRecord({
    farmId: input.farmId,
    farmName: input.farmName.trim(),
    displayName: input.displayName.trim(),
    farmSeed: input.farmSeed,
    devicePin: input.skipPin ? undefined : input.devicePin,
    role,
    joinedViaTicket: input.joinedViaTicket,
  });

  await saveMistDeviceSession(session, input.skipPin ? undefined : input.devicePin, {
    joinTicketPending: input.joinTicketPending,
  });
  await createAppFarmStore(input.farmId);

  window.location.href = mistSetupDestination({
    role,
    joinedViaTicket: input.joinedViaTicket,
    joinTicketPending: input.joinTicketPending,
  });
}
