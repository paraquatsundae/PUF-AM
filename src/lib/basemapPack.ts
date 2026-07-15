/** Local Esri World Imagery basemap packs stored in IndexedDB. */

export const ESRI_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const ESRI_ATTRIBUTION =
  'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

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
  source: 'esri-world-imagery';
};

const DB_NAME = 'sentinut_basemap';
const DB_VERSION = 1;
const PACKS_STORE = 'basemap_packs';
const TILES_STORE = 'basemap_tiles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PACKS_STORE)) {
        db.createObjectStore(PACKS_STORE, { keyPath: 'farmId' });
      }
      if (!db.objectStoreNames.contains(TILES_STORE)) {
        // key: `${farmId}/${z}/${x}/${y}`
        db.createObjectStore(TILES_STORE, { keyPath: 'key' });
      }
    };
  });
}

function tileKey(farmId: string, z: number, x: number, y: number): string {
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
    tx.objectStore(TILES_STORE).put({
      key: tileKey(farmId, z, x, y),
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
    const req = tx.objectStore(TILES_STORE).get(tileKey(farmId, z, x, y));
    req.onsuccess = () => {
      const row = req.result as { blob?: Blob } | undefined;
      resolve(row?.blob ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete pack metadata and all tiles for a farm. */
export async function clearBasemapPack(farmId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PACKS_STORE, TILES_STORE], 'readwrite');
    tx.objectStore(PACKS_STORE).delete(farmId);

    const tileStore = tx.objectStore(TILES_STORE);
    const cursorReq = tileStore.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const value = cursor.value as { farmId?: string };
      if (value.farmId === farmId) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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

export function tileUrl(z: number, x: number, y: number): string {
  return ESRI_IMAGERY_URL.replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
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

/** Rough size estimate (~25 KB average JPEG tile for Esri imagery). */
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
