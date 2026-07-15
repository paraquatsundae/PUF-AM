/**
 * Local-first farm geometry: IndexedDB is source of truth on device;
 * Firestore is the cloud mirror when online and not in workshop mode.
 */
import { mapApi } from '../services/api';
import { isLocalOnlyFarmSession } from './workshopMode';
import { localMapStore } from './localMapStore';
import type { OrchardBlock, InfrastructurePin, FarmTrack, MapViewport } from './mapStore';
import {
  FarmGeometryBundle,
  PendingGeometryOp,
  clearPendingForFarm,
  deleteBlockLocal,
  deletePinLocal,
  deleteTrackLocal,
  enqueuePending,
  getFarmGeometry,
  listPending,
  mergeGeometryById,
  removePending,
  saveFarmGeometry,
  saveViewportLocal,
  upsertBlockLocal,
  upsertPinLocal,
  upsertTrackLocal,
  withFarmGeometryWrite,
} from './farmGeometryIdb';

const online = () => typeof navigator === 'undefined' || navigator.onLine;

async function migrateLocalStorageIfNeeded(farmId: string, bundle: FarmGeometryBundle): Promise<FarmGeometryBundle> {
  const empty =
    bundle.blocks.length === 0 &&
    bundle.pins.length === 0 &&
    bundle.tracks.length === 0 &&
    !bundle.viewport;
  if (!empty) return bundle;

  const blocks = localMapStore.getBlocks(farmId);
  const pins = localMapStore.getPins(farmId);
  const tracks = localMapStore.getTracks(farmId);
  const viewport = localMapStore.getViewport(farmId);
  if (blocks.length === 0 && pins.length === 0 && tracks.length === 0 && !viewport) {
    return bundle;
  }

  const migrated: FarmGeometryBundle = {
    farmId,
    blocks,
    pins,
    tracks,
    viewport,
    updatedAt: new Date().toISOString(),
  };
  await saveFarmGeometry(migrated);
  return migrated;
}

function mergeList<T extends { id: string }>(
  local: T[],
  remote: T[] | null,
  pending: PendingGeometryOp[],
  collection: PendingGeometryOp['collection']
): T[] {
  // Cloud unread / errored — never invent an empty farm over local data
  if (remote === null) return local;

  const hasPendingForCollection = pending.some((p) => p.collection === collection);
  if (hasPendingForCollection || local.length > 0) {
    // Local wins on id collisions (offline edits / recent draws)
    return mergeGeometryById(local, remote);
  }
  return mergeGeometryById(remote, local);
}

/** Load geometry for UI: always from IndexedDB first; hydrate from cloud when possible. */
export async function loadFarmGeometryLocalFirst(farmId: string): Promise<FarmGeometryBundle> {
  let local = await getFarmGeometry(farmId);
  local = await migrateLocalStorageIfNeeded(farmId, local);

  if (isLocalOnlyFarmSession() || !online()) {
    return local;
  }

  try {
    const pending = await listPending(farmId);
    const [remoteBlocks, remotePins, remoteTracks, remoteViewport] = await Promise.all([
      mapApi.getBlocks(farmId),
      mapApi.getPins(farmId),
      mapApi.getTracks(farmId),
      mapApi.getViewport(farmId),
    ]);

    // Merge under the per-farm write lock so a draw mid-hydrate cannot be wiped
    return await withFarmGeometryWrite(farmId, (latestLocal) => {
      const merged: FarmGeometryBundle = {
        farmId,
        blocks: mergeList(latestLocal.blocks, remoteBlocks, pending, 'blocks'),
        pins: mergeList(latestLocal.pins, remotePins, pending, 'pins'),
        tracks: mergeList(latestLocal.tracks, remoteTracks, pending, 'tracks'),
        viewport: latestLocal.viewport || remoteViewport,
        updatedAt: new Date().toISOString(),
      };

      const localHadGeometry =
        latestLocal.blocks.length > 0 ||
        latestLocal.pins.length > 0 ||
        latestLocal.tracks.length > 0;
      const mergedEmpty =
        merged.blocks.length === 0 && merged.pins.length === 0 && merged.tracks.length === 0;
      if (localHadGeometry && mergedEmpty) {
        console.warn('[farmGeometry] Refusing to overwrite local geometry with empty merge');
        return latestLocal;
      }
      return merged;
    });
  } catch (err) {
    console.warn('[farmGeometry] Cloud hydrate failed; using local only', err);
    return getFarmGeometry(farmId);
  }
}

async function tryCloudOrQueue(
  farmId: string,
  collection: PendingGeometryOp['collection'],
  op: PendingGeometryOp['op'],
  entityId: string,
  cloudFn: () => Promise<void>,
  payload?: PendingGeometryOp['payload']
): Promise<void> {
  // Workshop: IndexedDB only (no cloud queue). Offline: queue for later sync.
  if (isLocalOnlyFarmSession()) return;
  if (!online()) {
    await enqueuePending({ farmId, collection, op, entityId, payload });
    return;
  }
  try {
    await cloudFn();
    const pending = await listPending(farmId);
    await Promise.all(
      pending
        .filter((p) => p.collection === collection && p.entityId === entityId)
        .map((p) => removePending(p.id))
    );
  } catch (err) {
    console.warn('[farmGeometry] Cloud write failed; queued', err);
    await enqueuePending({ farmId, collection, op, entityId, payload });
  }
}

export async function persistBlock(farmId: string, block: OrchardBlock): Promise<void> {
  await upsertBlockLocal(farmId, block);
  await tryCloudOrQueue(farmId, 'blocks', 'upsert', block.id, () => mapApi.saveBlock(farmId, block), block);
}

export async function removeBlockPersisted(farmId: string, id: string): Promise<void> {
  await deleteBlockLocal(farmId, id);
  await tryCloudOrQueue(farmId, 'blocks', 'delete', id, () => mapApi.deleteBlock(farmId, id));
}

export async function persistPin(farmId: string, pin: InfrastructurePin): Promise<void> {
  await upsertPinLocal(farmId, pin);
  await tryCloudOrQueue(farmId, 'pins', 'upsert', pin.id, () => mapApi.savePin(farmId, pin), pin);
}

export async function removePinPersisted(farmId: string, id: string): Promise<void> {
  await deletePinLocal(farmId, id);
  await tryCloudOrQueue(farmId, 'pins', 'delete', id, () => mapApi.deletePin(farmId, id));
}

export async function persistTrack(farmId: string, track: FarmTrack): Promise<void> {
  await upsertTrackLocal(farmId, track);
  await tryCloudOrQueue(farmId, 'tracks', 'upsert', track.id, () => mapApi.saveTrack(farmId, track), track);
}

export async function removeTrackPersisted(farmId: string, id: string): Promise<void> {
  await deleteTrackLocal(farmId, id);
  await tryCloudOrQueue(farmId, 'tracks', 'delete', id, () => mapApi.deleteTrack(farmId, id));
}

export async function persistViewport(farmId: string, viewport: MapViewport): Promise<void> {
  await saveViewportLocal(farmId, viewport);
  await tryCloudOrQueue(
    farmId,
    'viewport',
    'upsert',
    'current',
    () => mapApi.saveViewport(farmId, viewport),
    viewport
  );
}

/** Push queued offline edits to Firestore. */
export async function flushPendingGeometry(farmId: string): Promise<{ flushed: number; failed: number }> {
  if (isLocalOnlyFarmSession() || !online()) {
    return { flushed: 0, failed: 0 };
  }

  const pending = await listPending(farmId);
  let flushed = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      if (item.collection === 'blocks') {
        if (item.op === 'upsert' && item.payload) {
          await mapApi.saveBlock(farmId, item.payload as OrchardBlock);
        } else if (item.op === 'delete') {
          await mapApi.deleteBlock(farmId, item.entityId);
        }
      } else if (item.collection === 'pins') {
        if (item.op === 'upsert' && item.payload) {
          await mapApi.savePin(farmId, item.payload as InfrastructurePin);
        } else if (item.op === 'delete') {
          await mapApi.deletePin(farmId, item.entityId);
        }
      } else if (item.collection === 'tracks') {
        if (item.op === 'upsert' && item.payload) {
          await mapApi.saveTrack(farmId, item.payload as FarmTrack);
        } else if (item.op === 'delete') {
          await mapApi.deleteTrack(farmId, item.entityId);
        }
      } else if (item.collection === 'viewport' && item.op === 'upsert' && item.payload) {
        await mapApi.saveViewport(farmId, item.payload as MapViewport);
      }
      await removePending(item.id);
      flushed += 1;
    } catch (err) {
      console.warn('[farmGeometry] Flush failed for', item.id, err);
      failed += 1;
    }
  }

  return { flushed, failed };
}

export async function pendingGeometryCount(farmId: string): Promise<number> {
  return (await listPending(farmId)).length;
}

export async function resetCloudMirror(farmId: string): Promise<void> {
  await clearPendingForFarm(farmId);
}
