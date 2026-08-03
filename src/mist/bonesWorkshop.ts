/**
 * Bones put/get smoke test via mist FarmStore (phase 4 workshop).
 */

import { bonesKey, sha256Hex } from '../../units/mist-freenet/src/index.ts';
import { getActiveMistStore } from './createFarmStore.ts';

export type BonesWorkshopResult = {
  key: string;
  contentHash: string;
  roundTripOk: boolean;
  payloadPreview: string;
};

const WORKSHOP_ASSET_ID = 'workshop-smoke';

export const BONES_WORKSHOP_ASSET_ID = WORKSHOP_ASSET_ID;

export async function runBonesWorkshopSmoke(farmId: string): Promise<BonesWorkshopResult> {
  const store = await getActiveMistStore();
  if (!store) {
    throw new Error('Mist store not active — select mist backend first');
  }

  const payload = new TextEncoder().encode(
    JSON.stringify({
      v: 1,
      kind: 'bones-workshop',
      farmId,
      ts: Date.now(),
      note: 'PUF-AM mist phase-4 smoke blob',
    }),
  );

  const key = bonesKey(farmId, WORKSHOP_ASSET_ID);
  const contentHash = sha256Hex(payload);

  await store.put(key, payload, {
    kind: 'bones',
    content_hash: contentHash,
    version: 1,
  });

  const entry = await store.get(key);
  const roundTripOk =
    entry !== null &&
    entry.meta.content_hash === contentHash &&
    entry.ciphertext.byteLength === payload.byteLength;

  return {
    key,
    contentHash,
    roundTripOk,
    payloadPreview: new TextDecoder().decode(entry?.ciphertext ?? payload).slice(0, 120),
  };
}

export async function readBonesWorkshopSmoke(farmId: string): Promise<BonesWorkshopResult | null> {
  const store = await getActiveMistStore();
  if (!store) return null;
  const key = bonesKey(farmId, WORKSHOP_ASSET_ID);
  const entry = await store.get(key);
  if (!entry) return null;
  return {
    key,
    contentHash: entry.meta.content_hash,
    roundTripOk: true,
    payloadPreview: new TextDecoder().decode(entry.ciphertext).slice(0, 120),
  };
}
