import { describe, expect, it } from 'vitest';
import { isSensorInfraType, SENSOR_INFRA_TYPE_IDS } from '../shared/farm/infraTypes';
import {
  bindingForPin,
  defaultBinding,
  parseSensorSettings,
  sensorPinsForBlock,
} from '../shared/farm/sensorBindings';

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
    expect(parsed.bindings.a).toEqual({ source: 'dpird', externalId: 'MA002', blockId: 'b1' });
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
});
