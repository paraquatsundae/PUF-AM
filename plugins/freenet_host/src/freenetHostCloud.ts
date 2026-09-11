/**
 * Hybrid enable for a cloud farm — the two writes and nothing else.
 *
 * Plans/FREENET_NETWORK_PACK.md §3: a Firestore farm turns its Freenet mirror on
 * by (1) sealing a FarmSeed on *this device*, tagged with the cloud farm id, and
 * (2) writing `networkPacks.freenet_host` on the farm doc. The seed is the part
 * that never leaves the device; the farm doc only ever learns the mist FarmId
 * derived from it, which is an address, not a key. Disabling is one farm-doc
 * write that flips `enabled` and keeps `mistFarmId`.
 *
 * Pure-ish: no React. The single in-tab subscription exists so the reconciler
 * and the tile re-read after a seal without a page reload.
 */

import { doc, updateDoc } from 'firebase/firestore';

import type { ParsedFarmCode } from '../../../units/mist-freenet/src/index.ts';
import {
  planFreenetHostFarmDocUpdate,
  type FreenetHostFarmDocState,
} from '../../../shared/farm/networkPacks';
import { db } from '../../../src/firebase';
import {
  createMistSessionRecord,
  hasMistDeviceSession,
  saveMistDeviceSession,
} from '../../../src/mist/mistDeviceSession.ts';
import { rememberUnlockedFarmSeed } from '../../../src/mist/mistFarmSeedCache.ts';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notified after a seed is sealed on this device for a hybrid farm. */
export function subscribeFreenetHybridDevice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}

/** The device holds one sealed seed; a second farm's enable would replace it. */
export function hybridSeedWouldReplaceExisting(): boolean {
  return hasMistDeviceSession();
}

export type SealHybridSeedInput = {
  cloudFarmId: string;
  farmName: string;
  displayName: string;
  parsed: ParsedFarmCode;
  devicePin?: string;
  /** `owner` on the device that minted the code, `farmer` for a member who typed it in. */
  role: 'owner' | 'farmer';
};

/**
 * Seal the FarmSeed on this device, tagged with the cloud farm it mirrors.
 *
 * Does **not** touch `pufam.farmStoreBackend`: the operator stays signed into the
 * cloud farm. That is what makes this device a hybrid *member* rather than a
 * Freenet farm — see `farmPipes.activeFarmPipe`.
 */
export async function sealHybridSeedOnThisDevice(input: SealHybridSeedInput): Promise<string> {
  const session = createMistSessionRecord({
    farmId: input.parsed.farmId,
    farmName: input.farmName,
    displayName: input.displayName,
    farmSeed: input.parsed.farmSeed,
    devicePin: input.devicePin,
    role: input.role,
    cloudFarmId: input.cloudFarmId,
  });
  await saveMistDeviceSession(session, input.devicePin, { joinTicketPending: false });
  // The operator just typed or minted the code, so a Send straight after
  // should not ask for the PIN again in this tab.
  rememberUnlockedFarmSeed(session.farmSeedHex);
  notify();
  return session.farmId;
}

/** Flip the farm doc. One `updateDoc` on a dotted path; no reads. */
export async function writeFreenetHostFarmDoc(
  cloudFarmId: string,
  input: {
    enabled: boolean;
    mistFarmId?: string;
    current: FreenetHostFarmDocState | null;
    changedBy: string;
  },
): Promise<void> {
  const patch = planFreenetHostFarmDocUpdate(input);
  await updateDoc(doc(db, 'farms', cloudFarmId), patch);
}
