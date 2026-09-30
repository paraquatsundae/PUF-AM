import { describe, expect, it } from 'vitest';
import { farmSettingsForFirestore } from '../src/lib/farmSettingsFirestore';
import { orchardBlockForFirestore } from '../src/lib/orchardBlockFirestore';
import type { FarmSettings } from '../src/lib/farmDiaryTypes';
import type { OrchardBlock } from '../src/lib/mapStoreTypes';

describe('farm settings firestore payload', () => {
  it('keeps farm type and the DPIRD station, and drops unknown keys', () => {
    const settings = {
      irrigationSystemType: 'micro',
      farmProfile: {
        enterprises: ['orchard_tree', 'broadacre'],
        primaryEnterpriseId: 'broadacre',
        livestockEnabled: false,
        defaultSpeciesId: 'walnut',
      },
      dpirdStationCode: 'MA002',
      dpirdStationName: 'Manjimup',
      highlightDefaultSeconds: 120,
      extra: 'nope',
    } as FarmSettings & { extra: string };

    expect(farmSettingsForFirestore(settings)).toEqual({
      irrigationSystemType: 'micro',
      farmProfile: {
        enterprises: ['orchard_tree', 'broadacre'],
        primaryEnterpriseId: 'broadacre',
        livestockEnabled: false,
        defaultSpeciesId: 'walnut',
      },
      dpirdStationCode: 'MA002',
      dpirdStationName: 'Manjimup',
      highlightDefaultSeconds: 120,
    });
  });
});

describe('orchard block firestore payload', () => {
  it('stores a broadacre paddock crop type and clears orchard species', () => {
    const block = {
      id: 'b1',
      name: 'North 40',
      cultivar: 'Wheat',
      species: '',
      cropKind: 'broadacre',
      geometryKind: 'boundary',
      seasonLabel: '2026 wheat',
      density: '',
      irrigation: '',
      areaHa: 42,
      geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
    } as OrchardBlock;

    const payload = orchardBlockForFirestore(block);
    expect(payload.cropKind).toBe('broadacre');
    expect(payload.species).toBe('');
    expect(payload.geometryKind).toBe('boundary');
    expect(payload.seasonLabel).toBe('2026 wheat');
    expect(payload.cultivar).toBe('Wheat');
    expect(typeof payload.geojson).toBe('string');
  });
});
