import { describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import {
  effectivePaddockAreaHa,
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
});
