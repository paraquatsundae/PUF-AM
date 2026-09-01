/**
 * Offline satellite basemap packs stored in IndexedDB.
 *
 * Imagery arrives through our own `/api/tiles/:z/:x/:y` proxy rather than
 * straight from a provider, so the provider, its terms and any key it needs stay
 * on the server. `server/tileProxyRoutes.ts` has the reasoning.
 */
import { apiUrl } from './apiBase';

export const IMAGERY_ATTRIBUTION =
  'Imagery © Western Australian Land Information Authority (Landgate) — SLIP';

export const DEFAULT_MIN_ZOOM = 12;
export const DEFAULT_MAX_ZOOM = 17;
/** Lowest maxZoom we will auto-shrink to when over the tile budget. */
export const MIN_ALLOWED_MAX_ZOOM = 15;
/** Hard cap — ~500 MB at AVG_TILE_BYTES. */
export const MAX_PACK_TILES = 20_000;
/** Expand Nominatim bbox by this many metres. */
export const BBOX_BUFFER_M = 3000;
/** Half-width of square when Nominatim has no bbox (metres). */
export const CENTER_HALF_EXTENT_M = 4000;

const SKIP_KEY_PREFIX = 'sentinut_basemap_skip_';

export function basemapSkipKey(farmId: string): string {
  return `${SKIP_KEY_PREFIX}${farmId}`;
}

export function getBasemapSkipped(farmId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(basemapSkipKey(farmId)) === '1';
  } catch {
    return false;
  }
}

export function setBasemapSkipped(farmId: string, skipped: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (skipped) localStorage.setItem(basemapSkipKey(farmId), '1');
    else localStorage.removeItem(basemapSkipKey(farmId));
  } catch {
    /* ignore quota / private mode */
  }
}

export type LatLngBoundsLiteral = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type BasemapPack = {
  farmId: string;
  label: string;
  bbox: LatLngBoundsLiteral;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  bytes: number;
  createdAt: string;
  /**
   * Which provider the tiles came from.
   *
   * Both values are live, and a single pack may hold a mixture. Tiles are keyed
   * `z/x/y` with no provider in the key, so packs downloaded from Esri before the
   * proxy landed keep serving offline exactly as they did — only new fetches go
   * to Landgate. This field records what a pack *started* as, which is enough to
   * explain a seam in the imagery to whoever asks about it.
   */
  source: 'esri-world-imagery' | 'landgate-locate';
};

const DB_NAME = 'sentinut_basemap';
/** v2: tiles shared across farms by z/x/y so overlapping downloads do not duplicate storage. */
const DB_VERSION = 2;
const PACKS_STORE = 'basemap_packs';
const TILES_STORE = 'basemap_tiles';

type TileRow = {
  key: string;
  farmId?: string;
  z: number;
  x: number;
  y: number;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      if (!db.objectStoreNames.contains(PACKS_STORE)) {
        db.createObjectStore(PACKS_STORE, { keyPath: 'farmId' });
      }
      if (!db.objectStoreNames.contains(TILES_STORE)) {
        // key: `${z}/${x}/${y}` (shared). Legacy v1 used `${farmId}/${z}/${x}/${y}`.
        db.createObjectStore(TILES_STORE, { keyPath: 'key' });
      }
      if (oldVersion < 2 && db.objectStoreNames.contains(TILES_STORE)) {
        const tx = (event.target as IDBOpenDBRequest).transaction;
        if (!tx) return;
        const store = tx.objectStore(TILES_STORE);
        // Collect first so we can dedupe safely inside the upgrade transaction.
        const pending: TileRow[] = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            pending.push(cursor.value as TileRow);
            cursor.continue();
            return;
          }
          const seen = new Set<string>();
          for (const row of pending) {
            const legacy = parseLegacyTileKey(row.key);
            if (!legacy) {
              seen.add(row.key);
              continue;
            }
            const sharedKey = sharedTileKey(legacy.z, legacy.x, legacy.y);
            store.delete(row.key);
            if (seen.has(sharedKey)) continue;
            seen.add(sharedKey);
            store.put({
              key: sharedKey,
              z: legacy.z,
              x: legacy.x,
              y: legacy.y,
              blob: row.blob,
            });
          }
        };
      }
    };
  });
}

/** Shared cache key — one blob per tile for the whole device, any provider. */
export function sharedTileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

function parseLegacyTileKey(
  key: string
): { farmId: string; z: number; x: number; y: number } | null {
  const parts = key.split('/');
  if (parts.length !== 4) return null;
  const z = Number(parts[1]);
  const x = Number(parts[2]);
  const y = Number(parts[3]);
  if (![z, x, y].every((n) => Number.isInteger(n))) return null;
  return { farmId: parts[0], z, x, y };
}

function legacyTileKey(farmId: string, z: number, x: number, y: number): string {
  return `${farmId}/${z}/${x}/${y}`;
}

export async function getBasemapPack(farmId: string): Promise<BasemapPack | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PACKS_STORE, 'readonly');
    const req = tx.objectStore(PACKS_STORE).get(farmId);
    req.onsuccess = () => resolve((req.result as BasemapPack) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBasemapPack(pack: BasemapPack): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PACKS_STORE, 'readwrite');
    tx.objectStore(PACKS_STORE).put(pack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putTile(
  farmId: string,
  z: number,
  x: number,
  y: number,
  blob: Blob
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TILES_STORE, 'readwrite');
    // Shared key — farmId kept only for debugging / legacy readers.
    tx.objectStore(TILES_STORE).put({
      key: sharedTileKey(z, x, y),
      farmId,
      z,
      x,
      y,
      blob,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const err = tx.error ?? new Error('IndexedDB tile write failed');
      if (isQuotaExceededError(err)) {
        const q = new Error('QuotaExceededError');
        q.name = 'QuotaExceededError';
        reject(q);
        return;
      }
      reject(err);
    };
  });
}

export async function getTileBlob(
  farmId: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TILES_STORE, 'readonly');
    const store = tx.objectStore(TILES_STORE);
    const sharedReq = store.get(sharedTileKey(z, x, y));
    sharedReq.onsuccess = () => {
      const shared = sharedReq.result as TileRow | undefined;
      if (shared?.blob) {
        resolve(shared.blob);
        return;
      }
      // Pre-v2 rows keyed by farmId/z/x/y
      const legacyReq = store.get(legacyTileKey(farmId, z, x, y));
      legacyReq.onsuccess = () => {
        const legacy = legacyReq.result as TileRow | undefined;
        resolve(legacy?.blob ?? null);
      };
      legacyReq.onerror = () => reject(legacyReq.error);
    };
    sharedReq.onerror = () => reject(sharedReq.error);
  });
}

/** All pack metadata currently on this device (any farm). */
export async function listBasemapPacks(): Promise<BasemapPack[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PACKS_STORE, 'readonly');
    const req = tx.objectStore(PACKS_STORE).getAll();
    req.onsuccess = () => {
      const packs = (req.result as BasemapPack[]) ?? [];
      packs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      resolve(packs);
    };
    req.onerror = () => reject(req.error);
  });
}

export type BasemapDeviceStats = {
  packCount: number;
  tileCount: number;
  bytes: number;
  packs: BasemapPack[];
};

/** Scan IndexedDB for every offline map pack + total tile storage. */
export async function scanBasemapDeviceStorage(): Promise<BasemapDeviceStats> {
  const packs = await listBasemapPacks();
  const db = await openDb();
  const { tileCount, bytes } = await new Promise<{ tileCount: number; bytes: number }>(
    (resolve, reject) => {
      let tileCount = 0;
      let bytes = 0;
      const tx = db.transaction(TILES_STORE, 'readonly');
      const cursorReq = tx.objectStore(TILES_STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve({ tileCount, bytes });
          return;
        }
        const row = cursor.value as TileRow;
        tileCount += 1;
        bytes += row.blob?.size ?? 0;
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    }
  );
  return { packCount: packs.length, tileCount, bytes, packs };
}

/**
 * Point the current farm at an existing on-device pack without re-downloading.
 * Tiles are shared, so this only writes pack metadata for `targetFarmId`.
 */
export async function adoptBasemapPack(
  source: BasemapPack,
  targetFarmId: string
): Promise<BasemapPack> {
  if (!targetFarmId) throw new Error('Missing farm id');
  const pack: BasemapPack = {
    ...source,
    farmId: targetFarmId,
    createdAt: new Date().toISOString(),
  };
  await saveBasemapPack(pack);
  return pack;
}

/** Build the set of shared tile keys required by the given packs. */
export function tileKeysForPacks(packs: BasemapPack[]): Set<string> {
  const keys = new Set<string>();
  for (const pack of packs) {
    for (const t of enumerateTiles(pack.bbox, pack.minZoom, pack.maxZoom)) {
      keys.add(sharedTileKey(t.z, t.x, t.y));
    }
  }
  return keys;
}

/**
 * Delete tiles not required by any remaining pack.
 * Call after removing a pack so storage can shrink when areas no longer overlap.
 */
export async function purgeUnusedBasemapTiles(): Promise<{ removed: number }> {
  const packs = await listBasemapPacks();
  const needed = tileKeysForPacks(packs);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let removed = 0;
    const tx = db.transaction(TILES_STORE, 'readwrite');
    const store = tx.objectStore(TILES_STORE);
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const row = cursor.value as TileRow;
      const legacy = parseLegacyTileKey(row.key);
      const sharedKey = legacy
        ? sharedTileKey(legacy.z, legacy.x, legacy.y)
        : row.key;
      if (!needed.has(sharedKey)) {
        cursor.delete();
        removed += 1;
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve({ removed });
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove this farm's pack metadata, then purge tiles no other pack still needs.
 * Overlapping imagery used by another farm stays on the device.
 */
export async function clearBasemapPack(farmId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PACKS_STORE, 'readwrite');
    tx.objectStore(PACKS_STORE).delete(farmId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await purgeUnusedBasemapTiles();
}

/** Expand a WGS84 point to a square bbox (half-extent in metres). */
export function squareBboxAround(
  lat: number,
  lng: number,
  halfExtentM: number = CENTER_HALF_EXTENT_M
): LatLngBoundsLiteral {
  const latRad = (lat * Math.PI) / 180;
  const dLat = halfExtentM / 111_320;
  const dLng = halfExtentM / (111_320 * Math.cos(latRad));
  return {
    south: lat - dLat,
    north: lat + dLat,
    west: lng - dLng,
    east: lng + dLng,
  };
}

/** Expand bbox by buffer metres on all sides. */
export function bufferBbox(
  bbox: LatLngBoundsLiteral,
  bufferM: number = BBOX_BUFFER_M
): LatLngBoundsLiteral {
  const midLat = (bbox.south + bbox.north) / 2;
  const latRad = (midLat * Math.PI) / 180;
  const dLat = bufferM / 111_320;
  const dLng = bufferM / (111_320 * Math.cos(latRad));
  return {
    south: bbox.south - dLat,
    north: bbox.north + dLat,
    west: bbox.west - dLng,
    east: bbox.east + dLng,
  };
}

export function lonToTileX(lon: number, z: number): number {
  const n = 2 ** z;
  return Math.floor(((lon + 180) / 360) * n);
}

export function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
}

/** One tile, through our proxy. `apiUrl` picks the hub or the cloud base. */
export function tileUrl(z: number, x: number, y: number): string {
  return apiUrl(`/api/tiles/${z}/${x}/${y}`);
}

/**
 * The proxy path as a Leaflet URL template, for layers that fetch tiles
 * themselves rather than going through `tileUrl()` per coordinate.
 */
export function tileUrlTemplate(): string {
  return apiUrl('/api/tiles/{z}/{x}/{y}');
}

export type TileCoord = { z: number; x: number; y: number };

export function enumerateTiles(
  bbox: LatLngBoundsLiteral,
  minZoom: number,
  maxZoom: number
): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    let xMin = lonToTileX(bbox.west, z);
    let xMax = lonToTileX(bbox.east, z);
    let yMin = latToTileY(bbox.north, z); // north → smaller y
    let yMax = latToTileY(bbox.south, z);
    xMin = Math.max(0, Math.min(n - 1, xMin));
    xMax = Math.max(0, Math.min(n - 1, xMax));
    yMin = Math.max(0, Math.min(n - 1, yMin));
    yMax = Math.max(0, Math.min(n - 1, yMax));
    if (xMin > xMax) [xMin, xMax] = [xMax, xMin];
    if (yMin > yMax) [yMin, yMax] = [yMax, yMin];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

/** Rough size estimate (~25 KB average JPEG tile). */
export const AVG_TILE_BYTES = 25_000;

export function estimatePackSize(tileCount: number): {
  tileCount: number;
  bytes: number;
  mbLabel: string;
} {
  const bytes = tileCount * AVG_TILE_BYTES;
  const mb = bytes / (1024 * 1024);
  return {
    tileCount,
    bytes,
    mbLabel: mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`,
  };
}

export function formatPackBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
}

export type PackZoomPlan = {
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  bytes: number;
  mbLabel: string;
  /** True when maxZoom was reduced from DEFAULT_MAX_ZOOM to fit the budget. */
  zoomReduced: boolean;
  /** True when even MIN_ALLOWED_MAX_ZOOM exceeds MAX_PACK_TILES. */
  overBudget: boolean;
};

/**
 * Pick the highest maxZoom (from preferredMax down to MIN_ALLOWED_MAX_ZOOM)
 * that stays within MAX_PACK_TILES.
 */
export function planPackZoom(
  bbox: LatLngBoundsLiteral,
  options?: {
    minZoom?: number;
    preferredMaxZoom?: number;
    maxTiles?: number;
  }
): PackZoomPlan {
  const minZoom = options?.minZoom ?? DEFAULT_MIN_ZOOM;
  const preferredMaxZoom = options?.preferredMaxZoom ?? DEFAULT_MAX_ZOOM;
  const maxTiles = options?.maxTiles ?? MAX_PACK_TILES;

  for (let maxZoom = preferredMaxZoom; maxZoom >= MIN_ALLOWED_MAX_ZOOM; maxZoom--) {
    const tiles = enumerateTiles(bbox, minZoom, maxZoom);
    const est = estimatePackSize(tiles.length);
    if (tiles.length <= maxTiles) {
      return {
        minZoom,
        maxZoom,
        tileCount: est.tileCount,
        bytes: est.bytes,
        mbLabel: est.mbLabel,
        zoomReduced: maxZoom < preferredMaxZoom,
        overBudget: false,
      };
    }
  }

  const fallbackTiles = enumerateTiles(bbox, minZoom, MIN_ALLOWED_MAX_ZOOM);
  const est = estimatePackSize(fallbackTiles.length);
  return {
    minZoom,
    maxZoom: MIN_ALLOWED_MAX_ZOOM,
    tileCount: est.tileCount,
    bytes: est.bytes,
    mbLabel: est.mbLabel,
    zoomReduced: true,
    overBudget: est.tileCount > maxTiles,
  };
}

export function bboxCenter(bbox: LatLngBoundsLiteral): { lat: number; lng: number } {
  return {
    lat: (bbox.south + bbox.north) / 2,
    lng: (bbox.west + bbox.east) / 2,
  };
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string; code?: number };
  if (e.name === 'QuotaExceededError') return true;
  if (e.code === 22 || e.code === 1014) return true;
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('quota') || msg.includes('storage');
}
