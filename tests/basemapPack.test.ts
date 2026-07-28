import { describe, expect, it } from 'vitest';
import {
  MAX_PACK_TILES,
  MIN_ALLOWED_MAX_ZOOM,
  bufferBbox,
  enumerateTiles,
  estimatePackSize,
  planPackZoom,
  sharedTileKey,
  squareBboxAround,
  tileKeysForPacks,
  type BasemapPack,
} from '../src/lib/basemapPack';

describe('basemapPack', () => {
  it('builds a square bbox around Manjimup', () => {
    const bbox = squareBboxAround(-34.24, 116.14, 4000);
    expect(bbox.south).toBeLessThan(-34.24);
    expect(bbox.north).toBeGreaterThan(-34.24);
    expect(bbox.west).toBeLessThan(116.14);
    expect(bbox.east).toBeGreaterThan(116.14);
  });

  it('buffers a bbox outward', () => {
    const base = { south: -34.3, west: 116.1, north: -34.2, east: 116.2 };
    const buffered = bufferBbox(base, 3000);
    expect(buffered.south).toBeLessThan(base.south);
    expect(buffered.north).toBeGreaterThan(base.north);
  });

  it('enumerates a non-empty tile set for z12–13', () => {
    const bbox = squareBboxAround(-34.24, 116.14, 2000);
    const tiles = enumerateTiles(bbox, 12, 13);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.z >= 12 && t.z <= 13)).toBe(true);
  });

  it('estimates pack size from tile count', () => {
    const est = estimatePackSize(100);
    expect(est.tileCount).toBe(100);
    expect(est.bytes).toBeGreaterThan(0);
    expect(est.mbLabel.length).toBeGreaterThan(0);
  });

  it('plans zoom within budget for a small farm bbox', () => {
    const bbox = squareBboxAround(-34.24, 116.14, 2000);
    const plan = planPackZoom(bbox);
    expect(plan.overBudget).toBe(false);
    expect(plan.tileCount).toBeLessThanOrEqual(MAX_PACK_TILES);
    expect(plan.maxZoom).toBeGreaterThanOrEqual(MIN_ALLOWED_MAX_ZOOM);
    expect(plan.maxZoom).toBeLessThanOrEqual(17);
  });

  it('reduces maxZoom when preferred zoom exceeds tile budget', () => {
    // Wide bbox that is expensive at z17
    const bbox = bufferBbox(
      { south: -34.5, west: 115.8, north: -33.9, east: 116.5 },
      0
    );
    const at17 = enumerateTiles(bbox, 12, 17).length;
    if (at17 <= MAX_PACK_TILES) {
      // Environment-specific; still assert planner returns a valid shape
      const plan = planPackZoom(bbox, { preferredMaxZoom: 17, maxTiles: 500 });
      expect(plan.maxZoom).toBeLessThanOrEqual(17);
      expect(plan.tileCount).toBeLessThanOrEqual(500);
      expect(plan.zoomReduced).toBe(true);
      return;
    }
    const plan = planPackZoom(bbox);
    expect(plan.zoomReduced || plan.overBudget).toBe(true);
    if (!plan.overBudget) {
      expect(plan.tileCount).toBeLessThanOrEqual(MAX_PACK_TILES);
      expect(plan.maxZoom).toBeLessThan(17);
    }
  });

  it('marks overBudget when even min allowed zoom exceeds cap', () => {
    const huge = { south: -35, west: 110, north: -30, east: 120 };
    const plan = planPackZoom(huge, { maxTiles: 100 });
    expect(plan.overBudget).toBe(true);
    expect(plan.maxZoom).toBe(MIN_ALLOWED_MAX_ZOOM);
  });

  it('uses shared tile keys so farms can share one blob per z/x/y', () => {
    expect(sharedTileKey(14, 14000, 9000)).toBe('14/14000/9000');
  });

  it('builds a deduped tile key set across overlapping packs', () => {
    const bbox = squareBboxAround(-34.24, 116.14, 500);
    const packA: BasemapPack = {
      farmId: 'farm_a',
      label: 'A',
      bbox,
      minZoom: 12,
      maxZoom: 12,
      tileCount: 0,
      bytes: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'esri-world-imagery',
    };
    const packB: BasemapPack = { ...packA, farmId: 'farm_b', label: 'B' };
    const keys = tileKeysForPacks([packA, packB]);
    const single = tileKeysForPacks([packA]);
    expect(keys.size).toBe(single.size);
    expect(keys.size).toBe(enumerateTiles(bbox, 12, 12).length);
  });
});
