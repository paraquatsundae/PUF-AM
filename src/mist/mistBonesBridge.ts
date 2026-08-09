/**
 * Bridge: local farm geometry (sentinut_farm_geometry) → mist Bones contract.
 *
 * Parallel to mistHotBridge — active when mist device session is unlocked.
 */

import {
  bonesKey,
  decryptBonesBlob,
  encryptBonesBlob,
  sha256Hex,
  type MistStore,
} from '../../units/mist-freenet/src/index.ts';
import { hasSubtleCrypto } from '../../units/mist-freenet/src/subtle-crypto.ts';
import {
  BONES_FARM_GEOMETRY_ASSET_ID,
  packFarmGeometryFromIdb,
  parseBonesFarmGeometryPayload,
  type BonesFarmGeometryPayload,
} from './bonesGeometry.ts';
import { ensureBrowserMistStore } from './createFarmStore.ts';
import { hasMistDeviceSession } from './mistDeviceSession.ts';
import {
  getMistHotPublishStatus,
  saveMistBonesPublishStatus,
  type MistBonesPublishStatus,
} from './mistHotPublishMeta.ts';
import {
  clearCachedFarmSeedForHot,
  farmSeedLockedError,
  getMistStoreForHotBridge,
  resolveMistFarmSeed,
} from './mistHotBridge.ts';

export type PublishMistBonesResult = {
  storageKey: string;
  contentHash: string;
  blockCount: number;
  pinCount: number;
  trackCount: number;
  hasViewport: boolean;
  encrypted: boolean;
  publishedAt: string;
};

export type ReadMistBonesResult = {
  storageKey: string;
  payload: BonesFarmGeometryPayload;
  contentHash: string;
  encrypted: boolean;
};

export { BONES_FARM_GEOMETRY_ASSET_ID };

/** Publish local geometry snapshot to mist bones (`farm-geometry` asset). */
export async function publishLocalGeometryToMistBones(
  farmId: string,
  devicePin?: string,
): Promise<PublishMistBonesResult | null> {
  if (!hasMistDeviceSession()) return null;

  const store = await getMistStoreForHotBridge();
  if (!store) return null;

  const farmSeed = await resolveMistFarmSeed(devicePin);
  if (!farmSeed) {
    throw farmSeedLockedError('publish bones', devicePin);
  }

  const { payload, plainBytes } = await packFarmGeometryFromIdb(farmId);
  const canEncrypt = hasSubtleCrypto();
  const storedBytes = canEncrypt ? await encryptBonesBlob(plainBytes, farmSeed) : plainBytes;

  const storageKey = bonesKey(farmId, BONES_FARM_GEOMETRY_ASSET_ID);
  const contentHash = sha256Hex(storedBytes);
  const publishedAt = new Date().toISOString();

  await store.put(storageKey, storedBytes, {
    kind: 'bones',
    content_hash: contentHash,
    size: storedBytes.byteLength,
    version: 1,
  });

  const result: PublishMistBonesResult = {
    storageKey,
    contentHash,
    blockCount: payload.blocks.length,
    pinCount: payload.pins.length,
    trackCount: payload.tracks.length,
    hasViewport: payload.viewport !== null,
    encrypted: canEncrypt,
    publishedAt,
  };

  saveMistBonesPublishStatus({
    farmId,
    ...result,
  });

  return result;
}

/** Read and decrypt the farm-geometry bones blob. */
export async function readMistBonesFarmGeometry(
  farmId: string,
  devicePin?: string,
): Promise<ReadMistBonesResult | null> {
  if (!hasMistDeviceSession()) return null;

  const store = await getMistStoreForHotBridge();
  if (!store) return null;

  const farmSeed = await resolveMistFarmSeed(devicePin);
  if (!farmSeed) {
    throw farmSeedLockedError('read bones', devicePin);
  }

  const storageKey = bonesKey(farmId, BONES_FARM_GEOMETRY_ASSET_ID);
  const entry = await store.get(storageKey);
  if (!entry) return null;

  const plain = await decryptBonesBlob(entry.ciphertext, farmSeed);
  const payload = parseBonesFarmGeometryPayload(plain);
  const encrypted = entry.ciphertext.byteLength !== plain.byteLength;

  return {
    storageKey,
    payload,
    contentHash: entry.meta.content_hash,
    encrypted,
  };
}

/** Read encrypted farm-geometry bytes from local IndexedDB mist store. */
export async function readLocalBonesCiphertext(
  farmId: string,
): Promise<{ storageKey: string; ciphertext: Uint8Array; contentHash: string } | null> {
  const store = await getMistStoreForHotBridge();
  if (!store) return null;

  const storageKey = bonesKey(farmId, BONES_FARM_GEOMETRY_ASSET_ID);
  const entry = await store.get(storageKey);
  if (!entry) return null;

  return {
    storageKey,
    ciphertext: entry.ciphertext,
    contentHash: entry.meta.content_hash,
  };
}

export { getMistHotPublishStatus as getMistPublishStatus, type MistBonesPublishStatus };

// Re-export for symmetry with hot bridge sign-out
export { clearCachedFarmSeedForHot as clearCachedFarmSeedForBones };

/** Open IndexedDB mist store when session exists. */
export async function getMistStoreForBonesBridge(): Promise<MistStore | null> {
  if (!hasMistDeviceSession()) return null;
  return ensureBrowserMistStore();
}
