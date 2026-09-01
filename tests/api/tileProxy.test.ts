/**
 * The imagery proxy — `server/tileProxyRoutes.ts`.
 *
 * Landgate's SLIP imagery has no tile cache (`singleFusedMapCache: false`,
 * `tileInfo: null`), so there is no `/tile/{z}/{y}/{x}` to forward to and this
 * module has to do the XYZ → Web Mercator bbox conversion itself. That maths is
 * the part worth testing: get it wrong by a sign or an axis and the map shows
 * plausible-looking imagery of the wrong place, which is far worse on a spray
 * record than a blank tile.
 *
 * The coordinate validation is the other half. It bounds what can be asked for
 * so a caller cannot drive absurd bboxes at a free government service.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

import {
  parseTileCoords,
  registerTileProxyRoutes,
  resetTileProxyForTests,
  tileToWebMercatorBbox,
  upstreamTileUrl,
} from '../../server/tileProxyRoutes.ts';

/** Half the Web Mercator circumference — the bbox edge at zoom 0. */
const EDGE = 20_037_508.342_789_244;

describe('tileToWebMercatorBbox', () => {
  it('zoom 0 is the whole world', () => {
    expect(tileToWebMercatorBbox(0, 0, 0)).toEqual({
      minX: -EDGE,
      minY: -EDGE,
      maxX: EDGE,
      maxY: EDGE,
    });
  });

  /**
   * Slippy-map Y counts down from the north while Mercator Y counts up, so this
   * is the assertion that catches a flipped axis: tile (0,0) at zoom 1 is the
   * north-west quadrant, not the south-west one.
   */
  it('zoom 1 tile 0,0 is the north-west quadrant', () => {
    const bbox = tileToWebMercatorBbox(1, 0, 0);
    expect(bbox.minX).toBeCloseTo(-EDGE, 6);
    expect(bbox.maxX).toBeCloseTo(0, 6);
    expect(bbox.minY).toBeCloseTo(0, 6);
    expect(bbox.maxY).toBeCloseTo(EDGE, 6);
  });

  it('zoom 1 tile 1,1 is the south-east quadrant', () => {
    const bbox = tileToWebMercatorBbox(1, 1, 1);
    expect(bbox.minX).toBeCloseTo(0, 6);
    expect(bbox.maxX).toBeCloseTo(EDGE, 6);
    expect(bbox.minY).toBeCloseTo(-EDGE, 6);
    expect(bbox.maxY).toBeCloseTo(0, 6);
  });

  it('produces square tiles at every zoom', () => {
    for (const z of [0, 1, 8, 12, 17, 19]) {
      const bbox = tileToWebMercatorBbox(z, 1, 1);
      expect(bbox.maxX - bbox.minX).toBeCloseTo(bbox.maxY - bbox.minY, 6);
    }
  });

  it('tiles tessellate — one tile ends where the next begins', () => {
    const left = tileToWebMercatorBbox(12, 3366, 2431);
    const right = tileToWebMercatorBbox(12, 3367, 2431);
    const below = tileToWebMercatorBbox(12, 3366, 2432);
    expect(right.minX).toBeCloseTo(left.maxX, 6);
    expect(below.maxY).toBeCloseTo(left.minY, 6);
  });

  /**
   * Anchors the maths to a real place rather than only to itself: the tile that
   * XYZ addressing says covers Perth must come back as a bbox that contains
   * Perth. A flipped axis or a sign error passes the tessellation checks above
   * and fails this one.
   */
  it('places z12/3366/2431 over Perth', () => {
    const bbox = tileToWebMercatorBbox(12, 3366, 2431);
    const toLon = (x: number) => (x / EDGE) * 180;
    const toLat = (y: number) =>
      (Math.atan(Math.sinh((y / EDGE) * Math.PI)) * 180) / Math.PI;

    const perth = { lat: -31.9505, lng: 115.8605 };
    expect(toLon(bbox.minX)).toBeLessThan(perth.lng);
    expect(toLon(bbox.maxX)).toBeGreaterThan(perth.lng);
    expect(toLat(bbox.minY)).toBeLessThan(perth.lat);
    expect(toLat(bbox.maxY)).toBeGreaterThan(perth.lat);

    // And it is one z12 tile wide, not the whole state.
    expect(toLon(bbox.maxX) - toLon(bbox.minX)).toBeCloseTo(360 / 4096, 6);
  });
});

describe('upstreamTileUrl', () => {
  it('asks for a 256px Web Mercator JPEG image', () => {
    const url = new URL(upstreamTileUrl(12, 3366, 2431));
    expect(url.searchParams.get('bboxSR')).toBe('3857');
    expect(url.searchParams.get('imageSR')).toBe('3857');
    expect(url.searchParams.get('size')).toBe('256,256');
    expect(url.searchParams.get('format')).toBe('jpg');
    expect(url.searchParams.get('f')).toBe('image');
    expect(url.searchParams.get('bbox')?.split(',')).toHaveLength(4);
  });

  it('targets Landgate SLIP by default', () => {
    expect(upstreamTileUrl(12, 3366, 2431)).toContain('services.slip.wa.gov.au');
  });

  it('never puts a caller-supplied host in the request', () => {
    // The whole reason this is not an open image proxy: the upstream host is
    // fixed here, so a caller picks a tile and never a target.
    const url = new URL(upstreamTileUrl(17, 107_734, 77_804));
    expect(url.hostname).toBe('services.slip.wa.gov.au');
  });
});

describe('parseTileCoords', () => {
  it('accepts a tile inside the grid', () => {
    expect(parseTileCoords('12', '3366', '2431')).toMatchObject({
      ok: true,
      z: 12,
      x: 3366,
      y: 2431,
    });
  });

  it.each([
    ['zoom above the cap', '20', '0', '0'],
    ['negative zoom', '-1', '0', '0'],
    ['fractional zoom', '12.5', '0', '0'],
    ['x past the grid width', '1', '2', '0'],
    ['y past the grid height', '1', '0', '2'],
    ['negative x', '5', '-1', '0'],
    ['fractional y', '5', '0', '1.5'],
    // Number() is generous with path segments in ways that matter here.
    ['empty zoom', '', '0', '0'],
    ['hex x', '5', '0x10', '0'],
    ['exponent y', '5', '0', '1e1'],
    ['whitespace zoom', ' 5', '0', '0'],
    ['not a number', 'twelve', '0', '0'],
  ])('rejects %s', (_label, z, x, y) => {
    const parsed = parseTileCoords(z, x, y);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeTruthy();
  });

  it('accepts the last tile in the grid but not one past it', () => {
    expect(parseTileCoords('2', '3', '3').ok).toBe(true);
    expect(parseTileCoords('2', '4', '3').ok).toBe(false);
    expect(parseTileCoords('2', '3', '4').ok).toBe(false);
  });

  /**
   * `CachedTileLayer` is mounted with `minZoom: 0`, so panning out asks for low-z
   * tiles on this same URL. Rejecting them would grey out the map the moment a
   * user zooms past their pack, which is why the accepted range is not the pack
   * range of 12–17.
   */
  it('accepts zooms below the offline pack range', () => {
    for (const z of [0, 1, 5, 11]) {
      expect(parseTileCoords(String(z), '0', '0').ok).toBe(true);
    }
  });
});

describe('GET /api/tiles/:z/:x/:y', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    registerTileProxyRoutes(app);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(() => resetTileProxyForTests());

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('400s a bad tile without reaching the upstream', async () => {
    const res = await fetch(`${baseUrl}/api/tiles/99/0/0`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Zoom/);
  });

  it('400s an out-of-grid x', async () => {
    const res = await fetch(`${baseUrl}/api/tiles/1/9/0`);
    expect(res.status).toBe(400);
  });
});
