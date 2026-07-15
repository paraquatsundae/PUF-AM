/**
 * Local farm geometry (blocks, pins, tracks, viewport) in IndexedDB —
 * same durability model as the Esri basemap pack.
 */
import type { OrchardBlock, InfrastructurePin, FarmTrack, MapViewport } from './mapStore';

export type FarmGeometryBundle = {
  farmId: string;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  viewport: MapViewport | null;
  updatedAt: string;
};

export type GeometryCollection = 'blocks' | 'pins' | 'tracks' | 'viewport';

export type PendingGeometryOp = {
  id: string;
  farmId: string;
  collection: GeometryCollection;
  op: 'upsert' | 'delete';
  entityId: string;
  payload?: OrchardBlock | InfrastructurePin | FarmTrack | MapViewport;
  createdAt: string;
};

const DB_NAME = 'sentinut_farm_geometry';
const DB_VERSION = 1;
const GEOMETRY_STORE = 'geometry';
const PENDING_STORE = 'pending';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GEOMETRY_STORE)) {
        db.createObjectStore(GEOMETRY_STORE, { keyPath: 'farmId' });
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        const store = db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
        store.createIndex('byFarm', 'farmId', { unique: false });
      }
    };
  });
}

function emptyBundle(farmId: string): FarmGeometryBundle {
  return {
    farmId,
    blocks: [],
    pins: [],
    tracks: [],
    viewport: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Serialize read-modify-write per farm so hydrate cannot clobber a concurrent draw. */
const farmWriteTail = new Map<string, Promise<unknown>>();

export async function withFarmGeometryWrite(
  farmId: string,
  fn: (current: FarmGeometryBundle) => FarmGeometryBundle | Promise<FarmGeometryBundle>
): Promise<FarmGeometryBundle> {
  const prev = farmWriteTail.get(farmId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const current = await getFarmGeometry(farmId);
      const bundle = await fn(current);
      await saveFarmGeometry(bundle);
      return bundle;
    });
  farmWriteTail.set(farmId, next);
  try {
    return await next;
  } finally {
    if (farmWriteTail.get(farmId) === next) farmWriteTail.delete(farmId);
  }
}

export async function getFarmGeometry(farmId: string): Promise<FarmGeometryBundle> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GEOMETRY_STORE, 'readonly');
    const req = tx.objectStore(GEOMETRY_STORE).get(farmId);
    req.onsuccess = () => resolve((req.result as FarmGeometryBundle) ?? emptyBundle(farmId));
    req.onerror = () => reject(req.error);
  });
}

export async function saveFarmGeometry(bundle: FarmGeometryBundle): Promise<void> {
  const db = await openDb();
  const next = { ...bundle, updatedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GEOMETRY_STORE, 'readwrite');
    tx.objectStore(GEOMETRY_STORE).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function upsertBlockLocal(farmId: string, block: OrchardBlock): Promise<void> {
  await withFarmGeometryWrite(farmId, (data) => {
    const blocks = [...data.blocks];
    const idx = blocks.findIndex((b) => b.id === block.id);
    if (idx >= 0) blocks[idx] = block;
    else blocks.push(block);
    return { ...data, blocks };
  });
}

export async function deleteBlockLocal(farmId: string, id: string): Promise<void> {
  await withFarmGeometryWrite(farmId, (data) => ({
    ...data,
    blocks: data.blocks.filter((b) => b.id !== id),
  }));
}

export async function upsertPinLocal(farmId: string, pin: InfrastructurePin): Promise<void> {
  await withFarmGeometryWrite(farmId, (data) => {
    const pins = [...data.pins];
    const idx = pins.findIndex((p) => p.id === pin.id);
    if (idx >= 0) pins[idx] = pin;
    else pins.push(pin);
    return { ...data, pins };
  });
}

export async function deletePinLocal(farmId: string, id: string): Promise<void> {
  await withFarmGeometryWrite(farmId, (data) => ({
    ...data,
    pins: data.pins.filter((p) => p.id !== id),
  }));
}

export async function upsertTrackLocal(farmId: string, track: FarmTrack): Promise<void> {
  await withFarmGeometryWrite(farmId, (data) => {
    const tracks = [...data.tracks];
    const idx = tracks.findIndex((t) => t.id === track.id);
    if (idx >= 0) tracks[idx] = track;
    else tracks.push(track);
    return { ...data, tracks };
  });
}

export async function deleteTrackLocal(farmId: string, id: string): Promise<void> {
  await withFarmGeometryWrite(farmId, (data) => ({
    ...data,
    tracks: data.tracks.filter((t) => t.id !== id),
  }));
}

export async function saveViewportLocal(farmId: string, viewport: MapViewport): Promise<void> {
  await withFarmGeometryWrite(farmId, (data) => ({ ...data, viewport }));
}

export async function enqueuePending(op: Omit<PendingGeometryOp, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
  const entry: PendingGeometryOp = {
    id: op.id || `${op.farmId}:${op.collection}:${op.entityId}:${op.op}`,
    farmId: op.farmId,
    collection: op.collection,
    op: op.op,
    entityId: op.entityId,
    payload: op.payload,
    createdAt: new Date().toISOString(),
  };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    tx.objectStore(PENDING_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPending(farmId: string): Promise<PendingGeometryOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readonly');
    const idx = tx.objectStore(PENDING_STORE).index('byFarm');
    const req = idx.getAll(farmId);
    req.onsuccess = () => {
      const rows = (req.result as PendingGeometryOp[]) || [];
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removePending(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    tx.objectStore(PENDING_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearPendingForFarm(farmId: string): Promise<void> {
  const pending = await listPending(farmId);
  await Promise.all(pending.map((p) => removePending(p.id)));
}

/** Prefer local entities; fill gaps from remote (local wins on same id). */
export function mergeGeometryById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) map.set(item.id, item);
  return Array.from(map.values());
}
