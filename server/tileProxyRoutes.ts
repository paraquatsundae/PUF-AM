/**
 * Satellite imagery proxy — `GET /api/tiles/:z/:x/:y`.
 *
 * The map used to point straight at `server.arcgisonline.com`, which put the
 * provider's terms, its availability and (for any keyed provider) its key in the
 * client bundle. Everything now goes through here instead, so:
 *
 * - swapping provider is an edit to `UPSTREAM_TEMPLATE` and nothing else;
 * - no map key ever reaches a browser;
 * - a pack download of 20,000 tiles hits the upstream once per distinct tile
 *   rather than once per device.
 *
 * Landgate's SLIP public imagery has no tile cache — `singleFusedMapCache` is
 * false and `tileInfo` is null — so there is no `/tile/{z}/{y}/{x}` to forward
 * to. The dynamic `export` endpoint renders an arbitrary bbox, so this module
 * does the XYZ → Web Mercator bbox conversion that a tiled service would have
 * done for us.
 *
 * Licence note: SLIP public imagery ships under Transaction Personal Use.
 * Commercial use needs Landgate's written say-so — see Plans/API_KEY_SECURITY.md.
 */
import type { Express, Request, Response } from 'express';

/** Half the Web Mercator circumference, in metres. The bbox edge at z0. */
const WEB_MERCATOR_HALF = 20_037_508.342_789_244;

/**
 * Landgate SLIP public imagery, dynamic export.
 *
 * `TILE_UPSTREAM_URL` exists so a licence answer of "no" is a deploy variable
 * rather than a release: point it at a paid ArcGIS-compatible export service and
 * nothing else changes.
 */
const UPSTREAM_TEMPLATE =
  process.env.TILE_UPSTREAM_URL ||
  'https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Locate/MapServer/export';

/** So the operator of a free government service can see who we are. */
const USER_AGENT = 'PUF-AM/1.0 (+https://am.pufworks.farm) walnut farm manager';

/**
 * Widest zoom we will render.
 *
 * Not the pack range (12–17), even though that is what a download enumerates:
 * `CachedTileLayer` is mounted with `minZoom: 0`, so panning out asks for low-z
 * tiles on the same URL, and rejecting those would put grey squares on the map
 * the moment a user zooms out past their pack. The open-proxy worry the range
 * was meant to answer is handled by the upstream host being fixed here — a
 * caller chooses a tile, never a target.
 */
const MAX_ZOOM = 19;

/** Upstream requests in flight at once, across all callers. */
const MAX_UPSTREAM_CONCURRENCY = 3;

/** Bytes of rendered tile held in this process. ~2,600 tiles at 25 KB. */
const MAX_CACHE_BYTES = 64 * 1024 * 1024;

const UPSTREAM_TIMEOUT_MS = 20_000;

export type TileBbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * The Web Mercator (EPSG:3857) extent of an XYZ tile.
 *
 * Slippy-map Y counts down from the north, which is why `maxY` is derived by
 * subtracting rather than adding.
 */
export function tileToWebMercatorBbox(z: number, x: number, y: number): TileBbox {
  const tileSpan = (2 * WEB_MERCATOR_HALF) / 2 ** z;
  const minX = -WEB_MERCATOR_HALF + x * tileSpan;
  const maxY = WEB_MERCATOR_HALF - y * tileSpan;
  return {
    minX,
    minY: maxY - tileSpan,
    maxX: minX + tileSpan,
    maxY,
  };
}

/**
 * Flat rather than a discriminated union on purpose: this project builds with
 * `strictNullChecks` off, and TypeScript will not narrow a union by a boolean
 * discriminant in that mode, so `parsed.error` after `if (!parsed.ok)` is an
 * error rather than a string.
 */
export type TileCoordParseResult = {
  ok: boolean;
  z: number;
  x: number;
  y: number;
  /** Operator-readable reason. Present only when `ok` is false. */
  error?: string;
};

/**
 * Digits only.
 *
 * `Number()` is generous with path segments in ways that matter here: `'0x10'`,
 * `'1e1'`, `' 5'` and `''` all pass `Number.isInteger` afterwards, so
 * `/api/tiles/5/0x10/0` would be accepted as an alias for `/api/tiles/5/16/0`.
 * Harmless in itself, but the response carries `Cache-Control: immutable`, and
 * an unbounded set of spellings for one tile is an unbounded set of cache
 * entries for it in anything sitting in front of us.
 */
const CANONICAL_INT = /^(0|[1-9][0-9]*)$/;

/**
 * Validate a `:z/:x/:y` triple.
 *
 * `x` and `y` are bounded by `2^z` — the grid at that zoom — so an absurd tile
 * index cannot become an absurd bbox at the upstream.
 */
export function parseTileCoords(
  zRaw: string,
  xRaw: string,
  yRaw: string
): TileCoordParseResult {
  const z = Number(zRaw);
  const x = Number(xRaw);
  const y = Number(yRaw);

  for (const [label, raw] of [
    ['Zoom', zRaw],
    ['x', xRaw],
    ['y', yRaw],
  ] as const) {
    if (!CANONICAL_INT.test(raw)) {
      return { ok: false, z, x, y, error: `${label} must be written as plain digits` };
    }
  }

  if (!Number.isInteger(z) || z < 0 || z > MAX_ZOOM) {
    return { ok: false, z, x, y, error: `Zoom must be an integer 0–${MAX_ZOOM}` };
  }
  const span = 2 ** z;
  if (!Number.isInteger(x) || x < 0 || x >= span) {
    return { ok: false, z, x, y, error: `x must be an integer 0–${span - 1} at zoom ${z}` };
  }
  if (!Number.isInteger(y) || y < 0 || y >= span) {
    return { ok: false, z, x, y, error: `y must be an integer 0–${span - 1} at zoom ${z}` };
  }
  return { ok: true, z, x, y };
}

/** The upstream export request for one tile. */
export function upstreamTileUrl(z: number, x: number, y: number): string {
  const { minX, minY, maxX, maxY } = tileToWebMercatorBbox(z, x, y);
  const params = new URLSearchParams({
    bbox: `${minX},${minY},${maxX},${maxY}`,
    bboxSR: '3857',
    imageSR: '3857',
    size: '256,256',
    format: 'jpg',
    transparent: 'false',
    f: 'image',
  });
  return `${UPSTREAM_TEMPLATE}?${params.toString()}`;
}

type CachedTile = { body: Buffer; contentType: string };

/**
 * Bounded LRU of rendered tiles.
 *
 * A `Map` preserves insertion order, so re-inserting on read is enough to make
 * the first key the least recently used. This is per-instance and lost on a cold
 * start, which is fine — it exists to absorb one farm's pack download, not to be
 * a durable cache. If the upstream ever complains about volume, this is where a
 * GCS-backed layer goes.
 */
const tileCache = new Map<string, CachedTile>();
let tileCacheBytes = 0;

/** In-flight upstream fetches, so N clients asking for one tile make one request. */
const inFlight = new Map<string, Promise<CachedTile>>();

let activeUpstream = 0;
const upstreamQueue: Array<() => void> = [];

/** Reset module state between tests. */
export function resetTileProxyForTests(): void {
  tileCache.clear();
  tileCacheBytes = 0;
  inFlight.clear();
  activeUpstream = 0;
  upstreamQueue.length = 0;
}

function cacheGet(key: string): CachedTile | undefined {
  const hit = tileCache.get(key);
  if (!hit) return undefined;
  tileCache.delete(key);
  tileCache.set(key, hit);
  return hit;
}

function cachePut(key: string, tile: CachedTile): void {
  // A single tile larger than the whole budget would evict everything and then
  // itself; not worth caching.
  if (tile.body.length > MAX_CACHE_BYTES) return;
  const existing = tileCache.get(key);
  if (existing) {
    tileCache.delete(key);
    tileCacheBytes -= existing.body.length;
  }
  tileCache.set(key, tile);
  tileCacheBytes += tile.body.length;
  while (tileCacheBytes > MAX_CACHE_BYTES) {
    const oldest = tileCache.keys().next();
    if (oldest.done) break;
    const evicted = tileCache.get(oldest.value);
    tileCache.delete(oldest.value);
    tileCacheBytes -= evicted?.body.length ?? 0;
  }
}

/**
 * Hold a slot on the upstream.
 *
 * `tileDownloader.ts` runs six parallel fetches per device and a pack is up to
 * 20,000 tiles. Six devices is 36 concurrent requests at a free government
 * service, which is how a proxy turns into a load generator. The queue makes the
 * client wait instead.
 */
async function acquireUpstreamSlot(): Promise<() => void> {
  if (activeUpstream < MAX_UPSTREAM_CONCURRENCY) {
    activeUpstream += 1;
  } else {
    await new Promise<void>((resolve) => upstreamQueue.push(resolve));
    activeUpstream += 1;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeUpstream -= 1;
    upstreamQueue.shift()?.();
  };
}

async function fetchTile(z: number, x: number, y: number): Promise<CachedTile> {
  const release = await acquireUpstreamSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(upstreamTileUrl(z, x, y), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/*' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Imagery upstream answered ${response.status}`), {
        status: 502,
      });
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    // An ArcGIS export failure is a 200 with a JSON error body, not a status.
    if (!contentType.startsWith('image/')) {
      throw Object.assign(new Error('Imagery upstream did not return an image'), {
        status: 502,
      });
    }
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType,
    };
  } finally {
    clearTimeout(timeout);
    release();
  }
}

export function registerTileProxyRoutes(app: Express): void {
  app.get('/api/tiles/:z/:x/:y', async (req: Request, res: Response) => {
    const parsed = parseTileCoords(
      String(req.params.z),
      String(req.params.x),
      String(req.params.y)
    );
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { z, x, y } = parsed;
    const key = `${z}/${x}/${y}`;

    const cached = cacheGet(key);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      // Imagery for a fixed tile does not change between captures, and a capture
      // is a yearly event. The client also keeps its own IndexedDB copy.
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      res.setHeader('X-Tile-Cache', 'hit');
      return res.send(cached.body);
    }

    try {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = fetchTile(z, x, y).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const tile = await pending;
      cachePut(key, tile);
      res.setHeader('Content-Type', tile.contentType);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      res.setHeader('X-Tile-Cache', 'miss');
      return res.send(tile.body);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status ?? 502;
      const aborted = error instanceof Error && error.name === 'AbortError';
      return res.status(aborted ? 504 : status).json({
        error: aborted
          ? 'Imagery upstream timed out'
          : error instanceof Error
            ? error.message
            : 'Imagery fetch failed',
      });
    }
  });
}
