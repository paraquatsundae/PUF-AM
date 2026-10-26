import { describe, expect, it } from 'vitest';
import { isSensorInfraType, SENSOR_INFRA_TYPE_IDS } from '../shared/farm/infraTypes';
import {
  bindingForPin,
  bindingToWrite,
  defaultBinding,
  parseSensorSettings,
  resolvedBlockIds,
  sensorPinsForBlock,
} from '../shared/farm/sensorBindings';
import { clampSensorRadiusM, formatSensorRadius } from '../shared/farm/sensorCoverage';

describe('sensor class (core infra)', () => {
  it('treats weather, soil, and irrigation as sensors — not dams or pipes', () => {
    expect(SENSOR_INFRA_TYPE_IDS).toEqual(['weather', 'soil', 'irrigation']);
    expect(isSensorInfraType('weather')).toBe(true);
    expect(isSensorInfraType('dam')).toBe(false);
    expect(isSensorInfraType('')).toBe(false);
  });
});

describe('sensorBindings', () => {
  it('parses bindings and drops junk sources', () => {
    const parsed = parseSensorSettings({
      bindings: {
        a: { source: 'dpird', externalId: ' MA002 ', blockId: 'b1' },
        b: { source: 'nope' },
        c: { source: 'manual' },
      },
    });
    expect(parsed.bindings.a).toEqual({
      source: 'dpird',
      externalId: 'MA002',
      blockIds: ['b1'],
    });
    expect(parsed.bindings.b).toBeUndefined();
    expect(parsed.bindings.c).toEqual({ source: 'manual' });
    expect(bindingForPin(parsed, 'a')?.source).toBe('dpird');
    expect(defaultBinding()).toEqual({ source: 'manual' });
  });

  it('lists sensor pins for a paddock', () => {
    const pins = [
      { id: 'w1', type: 'weather' },
      { id: 's1', type: 'soil' },
      { id: 'd1', type: 'dam' },
    ];
    const settings = parseSensorSettings({
      bindings: {
        w1: { source: 'manual', blockId: 'north' },
        s1: { source: 'other', blockId: 'north' },
      },
    });
    expect(sensorPinsForBlock(pins, settings, 'north')).toEqual(['w1', 's1']);
    expect(sensorPinsForBlock(pins, settings, 'north', 'soil')).toEqual(['s1']);
    expect(sensorPinsForBlock(pins, settings, 'south')).toEqual([]);
  });

  it('treats an inactive pack as manual / empty', () => {
    const settings = parseSensorSettings({
      bindings: { w1: { source: 'dpird', blockId: 'north' } },
    });
    expect(bindingForPin(settings, 'w1', false)).toEqual({ source: 'manual' });
    expect(sensorPinsForBlock([{ id: 'w1', type: 'weather' }], settings, 'north', undefined, false)).toEqual(
      []
    );
  });

  it('keeps an empty manual list and clamps the radius', () => {
    const parsed = parseSensorSettings({
      bindings: { a: { source: 'manual', radiusM: 80_000, blockIds: [] } },
    });
    expect(parsed.bindings.a?.radiusM).toBe(50_000);
    expect(parsed.bindings.a?.blockIds).toEqual([]);
    expect(clampSensorRadiusM(0)).toBe(1);
    expect(formatSensorRadius(1500)).toBe('1.5 km');
    expect(bindingToWrite(parsed.bindings.a!)).toEqual({
      source: 'manual',
      radiusM: 50_000,
      blockIds: [],
    });
  });
});

const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ],
  ],
};

describe('sensor coverage assignment', () => {
  const blocks = [{ id: 'home', geojson: square }];
  const inside = { id: 's1', type: 'soil', lat: 0.0005, lng: 0.0005 };

  it('assigns a paddock the circle touches, using the class default when radius is unset', () => {
    expect(resolvedBlockIds(defaultBinding(), inside, blocks)).toEqual(['home']);
    expect(
      sensorPinsForBlock([inside, { id: 'd1', type: 'dam', lat: 0.0005, lng: 0.0005 }], undefined, 'home', undefined, true, blocks)
    ).toEqual(['s1']);
  });

  it('misses a paddock the circle does not reach, and hits it when the radius grows', () => {
    const south = { lat: -0.0005, lng: 0.0005, type: 'soil' };
    expect(resolvedBlockIds({ source: 'manual', radiusM: 40 }, south, blocks)).toEqual([]);
    expect(resolvedBlockIds({ source: 'manual', radiusM: 80 }, south, blocks)).toEqual(['home']);
  });

  it('uses a manual paddock list instead of the circle', () => {
    expect(resolvedBlockIds({ source: 'manual', blockIds: ['other'] }, inside, blocks)).toEqual(['other']);
    expect(resolvedBlockIds({ source: 'manual', blockIds: [] }, inside, blocks)).toEqual([]);
  });
});
