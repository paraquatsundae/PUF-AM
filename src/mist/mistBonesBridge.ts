/**
 * Bridge: local farm geometry (sentinut_farm_geometry) → mist Bones contract.
 *
 * Parallel to mistHotBridge — active when mist device session is unlocked.
 */

import {
  bonesKey,
  decryptBonesBlob,
  decryptBonesBlobWithKey,
  encryptBonesBlobWithKey,
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
import { hasMistDeviceSession, mistSessionCloudFarmId } from './mistDeviceSession.ts';
import {
  getMistHotPublishStatus,
  saveMistBonesPublishStatus,
  type MistBonesPublishStatus,
} from './mistHotPublishMeta.ts';
import {
  clearCachedFarmSeedForHot,
  farmSeedLockedError,
  getMistStoreForHotBridge,
  isMistHotMirrorAvailable,
  resolveMistReadKeys,
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

export type PublishMistBonesOpts = {
  devicePin?: string;
  /** Skip when keys are still locked (auto-publish). */
  auto?: boolean;
  /**
   * Hybrid (`Plans/FREENET_NETWORK_PACK.md` §3): read geometry from the
   * cloud farm's local cache, seal under the mist `farmId`.
   */
  cloudFarmId?: string;
};

const autoPublishTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTO_PUBLISH_DEBOUNCE_MS = 2500;

/**
 * Publish local geometry snapshot to mist bones (`farm-geometry` asset).
 *
 * Seals with **BonesKey** — crew or owner. Never requires FarmSeed.
 *
 * `opts.cloudFarmId` is the hybrid case (`Plans/FREENET_NETWORK_PACK.md` §3):
 * geometry is read from the Firestore farm's local cache under the cloud id,
 * sealed and stored under the mist `farmId`. No Firestore read is made here.
 */
export async function publishLocalGeometryToMistBones(
  farmId: string,
  devicePin?: string,
  opts?: PublishMistBonesOpts,
): Promise<PublishMistBonesResult | null> {
  if (!hasMistDeviceSession()) return null;

  const store = await getMistStoreForHotBridge();
  if (!store) return null;

  const readKeys = await resolveMistReadKeys(devicePin ?? opts?.devicePin);
  if (!readKeys) {
    if (opts?.auto) return null;
    throw farmSeedLockedError('publish bones', devicePin ?? opts?.devicePin);
  }

  const { payload, plainBytes } = await packFarmGeometryFromIdb(
    opts?.cloudFarmId?.trim() || farmId,
  );
  const canEncrypt = hasSubtleCrypto();
  const storedBytes = canEncrypt
    ? await encryptBonesBlobWithKey(plainBytes, readKeys.bonesKey)
    : plainBytes;

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

  const keys = await resolveMistReadKeys(devicePin);
  if (!keys) {
    throw farmSeedLockedError('read bones', devicePin);
  }

  const storageKey = bonesKey(farmId, BONES_FARM_GEOMETRY_ASSET_ID);
  const entry = await store.get(storageKey);
  if (!entry) return null;

  const plain = keys.farmSeed
    ? await decryptBonesBlob(entry.ciphertext, keys.farmSeed)
    : await decryptBonesBlobWithKey(entry.ciphertext, keys.bonesKey);
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

/**
 * Debounced auto-publish after local paddock / pin / track writes.
 *
 * Writes local bones, PUTs to Freenet, bumps the Hot-watch slot with a bones
 * hash so the other terminal's 20s poll sees geometry change
 * (`Plans/SETTINGS_SYNC_AND_CREW.md` §9 Decision 2026-09-13).
 *
 * Skipped on a hybrid device: same Send-only rule as Hot.
 */
export function scheduleMistBonesAutoPublish(farmId: string): void {
  if (!isMistHotMirrorAvailable()) return;
  if (mistSessionCloudFarmId()) return;

  const existing = autoPublishTimers.get(farmId);
  if (existing) clearTimeout(existing);

  autoPublishTimers.set(
    farmId,
    setTimeout(() => {
      autoPublishTimers.delete(farmId);
      void publishLocalGeometryToMistBones(farmId, undefined, { auto: true })
        .then((result) => {
          if (!result) return;
          return import('./mistFreenetClient.ts').then(({ publishBonesToFreenet }) =>
            publishBonesToFreenet(farmId),
          );
        })
        .catch((err) => {
          console.warn('[mistBonesBridge] auto-publish failed:', err);
        });
    }, AUTO_PUBLISH_DEBOUNCE_MS),
  );
}
