import {
  BasemapPack,
  LatLngBoundsLiteral,
  enumerateTiles,
  getTileBlob,
  isQuotaExceededError,
  putTile,
  saveBasemapPack,
  tileUrl,
  DEFAULT_MIN_ZOOM,
  DEFAULT_MAX_ZOOM,
} from './basemapPack';

export type DownloadProgress = {
  done: number;
  total: number;
  bytes: number;
  percent: number;
  currentLabel: string;
  /** Tiles taken from device cache (no network). */
  reused: number;
  /** Tiles fetched from the network. */
  downloaded: number;
};

export type DownloadOptions = {
  farmId: string;
  label: string;
  bbox: LatLngBoundsLiteral;
  minZoom?: number;
  maxZoom?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
};

async function fetchTileBlob(
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
  attempts = 2
): Promise<Blob> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Download cancelled', 'AbortError');
    }
    try {
      const url = tileUrl(z, x, y);
      const res = await fetch(url, { signal, mode: 'cors' });
      if (!res.ok) {
        throw new Error(`Tile fetch failed ${z}/${x}/${y}: HTTP ${res.status}`);
      }
      return await res.blob();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Tile fetch failed ${z}/${x}/${y}`);
}

/**
 * Download Esri World Imagery tiles for a bbox into IndexedDB and save pack metadata.
 * Reuses tiles already on the device (shared cache) so overlapping areas are not
 * downloaded or stored twice. Failed updates leave the previous pack intact.
 */
export async function downloadBasemapPack(options: DownloadOptions): Promise<BasemapPack> {
  const {
    farmId,
    label,
    bbox,
    minZoom = DEFAULT_MIN_ZOOM,
    maxZoom = DEFAULT_MAX_ZOOM,
    concurrency = 6,
    signal,
    onProgress,
  } = options;

  let done = 0;
  let bytes = 0;
  let reused = 0;
  let downloaded = 0;
  let total = 0;

  const report = (currentLabel: string) => {
    onProgress?.({
      done,
      total,
      bytes,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      currentLabel,
      reused,
      downloaded,
    });
  };

  report('Scanning device cache…');

  const tiles = enumerateTiles(bbox, minZoom, maxZoom);
  total = tiles.length;
  report('Starting download…');

  let index = 0;
  async function worker() {
    while (index < tiles.length) {
      if (signal?.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }
      const i = index++;
      const t = tiles[i];
      try {
        const existing = await getTileBlob(farmId, t.z, t.x, t.y);
        if (existing) {
          done += 1;
          reused += 1;
          bytes += existing.size;
          if (done % 5 === 0 || done === total) {
            report(
              reused === done
                ? `Reusing cached tiles (${done}/${total})`
                : `z${t.z} (${done}/${total}, ${reused} reused)`
            );
          }
          continue;
        }

        const blob = await fetchTileBlob(t.z, t.x, t.y, signal, 2);
        await putTile(farmId, t.z, t.x, t.y, blob);
        done += 1;
        downloaded += 1;
        bytes += blob.size;
        if (done % 5 === 0 || done === total) {
          report(`z${t.z} (${done}/${total}, ${reused} reused)`);
        }
      } catch (err) {
        if (isQuotaExceededError(err)) {
          throw new Error(
            'Device storage is full (or the area is too large). Clear unused map packs or pick a smaller region.'
          );
        }
        throw err;
      }
    }
  }

  try {
    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(total, 1)) },
      () => worker()
    );
    await Promise.all(workers);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new Error(
        'Device storage is full (or the area is too large). Clear unused map packs or pick a smaller region.'
      );
    }
    throw err;
  }

  const pack: BasemapPack = {
    farmId,
    label,
    bbox,
    minZoom,
    maxZoom,
    tileCount: total,
    bytes,
    createdAt: new Date().toISOString(),
    source: 'esri-world-imagery',
  };
  try {
    await saveBasemapPack(pack);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new Error(
        'Device storage is full (or the area is too large). Clear unused map packs or pick a smaller region.'
      );
    }
    throw err;
  }
  report(
    reused > 0
      ? `Complete — reused ${reused.toLocaleString()} tiles already on this device`
      : 'Complete'
  );
  return pack;
}
