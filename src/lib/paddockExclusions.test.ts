import { describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import {
  asFeature,
  effectivePaddockAreaHa,
  internalBoundariesIntersectingBlock,
  polygonMostlyOutsideBlock,
  polygonOverlapRatioWithBlock,
  recomputeBlockAreasForFarm,
  subtractingExclusionPolygons,
} from './paddockExclusions';
import type { InfrastructurePin, OrchardBlock } from './mapStore';

describe('paddockExclusions', () => {
  const block = turf.polygon([
    [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0, 0],
    ],
  ]);
  const inner = turf.polygon([
    [
      [0.002, 0.002],
      [0.008, 0.002],
      [0.008, 0.008],
      [0.002, 0.008],
      [0.002, 0.002],
    ],
  ]);

  it('returns full exterior area with no exclusions', () => {
    const full = effectivePaddockAreaHa(block, []);
    expect(full).toBeGreaterThan(0);
  });

  it('subtracts overlapping dam / impassable polygons', () => {
    const full = effectivePaddockAreaHa(block, []);
    const net = effectivePaddockAreaHa(block, [inner]);
    expect(net).toBeLessThan(full);
    expect(net).toBeGreaterThan(0);
  });

  it('collects only subtracting pin polygons', () => {
    const pins: InfrastructurePin[] = [
      {
        id: '1',
        name: 'Dam',
        type: 'dam',
        status: 'active',
        lat: 0,
        lng: 0,
        geojson: inner,
      },
      {
        id: '2',
        name: 'Pad',
        type: 'internal_passable',
        status: 'active',
        lat: 0,
        lng: 0,
        geojson: inner,
      },
      {
        id: '3',
        name: 'Hazard zone',
        type: 'internal_impassable',
        status: 'active',
        lat: 0,
        lng: 0,
        geojson: inner,
      },
    ];
    const excl = subtractingExclusionPolygons(pins);
    expect(excl).toHaveLength(2);
  });

  it('recomputeBlockAreasForFarm only returns changed rows', () => {
    const full = effectivePaddockAreaHa(block, []);
    const blocks: OrchardBlock[] = [
      {
        id: 'b1',
        name: 'A',
        cultivar: '',
        density: '',
        irrigation: '',
        areaHa: full,
        geojson: block,
      },
    ];
    const pins: InfrastructurePin[] = [
      {
        id: 'd1',
        name: 'Dam',
        type: 'dam',
        status: 'active',
        lat: 0,
        lng: 0,
        geojson: inner,
      },
    ];
    const updates = recomputeBlockAreasForFarm(blocks, pins);
    expect(updates).toHaveLength(1);
    expect(updates[0].areaHa).toBeLessThan(full);
  });

  it('lists internal boundaries that intersect a block', () => {
    const outside = turf.polygon([
      [
        [0.02, 0.02],
        [0.03, 0.02],
        [0.03, 0.03],
        [0.02, 0.03],
        [0.02, 0.02],
      ],
    ]);
    const blockRow: OrchardBlock = {
      id: 'b1',
      name: 'A',
      cultivar: '',
      density: '',
      irrigation: '',
      areaHa: 1,
      geojson: block,
    };
    const pins: InfrastructurePin[] = [
      {
        id: 'p1',
        name: 'Pad',
        type: 'internal_passable',
        status: 'active',
        lat: 0,
        lng: 0,
        geojson: inner,
      },
      {
        id: 'p2',
        name: 'Elsewhere',
        type: 'internal_impassable',
        status: 'active',
        lat: 0,
        lng: 0,
        geojson: outside,
      },
      {
        id: 'd1',
        name: 'Dam',
        type: 'dam',
        status: 'active',
        lat: 0,
        lng: 0,
        geojson: inner,
      },
    ];
    const hits = internalBoundariesIntersectingBlock(blockRow, pins);
    expect(hits.map((p) => p.id)).toEqual(['p1']);
  });

  it('detects polygons mostly outside the block', () => {
    const mostlyOut = turf.polygon([
      [
        [0.008, 0.008],
        [0.02, 0.008],
        [0.02, 0.02],
        [0.008, 0.02],
        [0.008, 0.008],
      ],
    ]);
    expect(polygonOverlapRatioWithBlock(inner, block)).toBeGreaterThan(0.9);
    expect(polygonMostlyOutsideBlock(inner, block)).toBe(false);
    expect(polygonMostlyOutsideBlock(mostlyOut, block)).toBe(true);
  });

  it('normalizes stringified / FeatureCollection / clockwise imported geojson', () => {
    const cw = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [0, 0],
            [0, 0.01],
            [0.01, 0.01],
            [0.01, 0],
            [0, 0],
          ],
        ],
      },
    };
    expect(asFeature(JSON.stringify(cw))?.geometry.type).toBe('Polygon');
    expect(
      asFeature({ type: 'FeatureCollection', features: [cw] })?.geometry.type
    ).toBe('Polygon');
    expect(polygonMostlyOutsideBlock(inner, JSON.stringify(cw))).toBe(false);
    expect(polygonOverlapRatioWithBlock(inner, cw)).toBeGreaterThan(0.9);
  });
});
