import { describe, expect, it } from 'vitest';
import { fieldBinPlaces, parkFieldBin, unparkFieldBin } from '../shared/farm/fieldBinPlace';
import { parseFieldBinSettings, settingsToWrite, type FieldBinSettings } from '../shared/farm/fieldBinStock';

const settings: FieldBinSettings = {
  vehicles: [],
  bins: { b1: { capacityT: 90, cropLabel: 'Canola' } },
};

describe('parkFieldBin', () => {
  it('keeps capacity and the name when the pin leaves the map', () => {
    const parked = settingsToWrite(
      parkFieldBin(settings, { id: 'b1', name: 'Field bin 1', notes: 'North' })
    );
    expect(parked.bins.b1).toEqual({
      capacityT: 90,
      cropLabel: 'Canola',
      parkedName: 'Field bin 1',
      parkedNotes: 'North',
    });
    const again = parseFieldBinSettings(parked);
    expect(again.bins.b1?.parkedName).toBe('Field bin 1');
  });

  it('remembers a bin that has no capacity yet', () => {
    const parked = parseFieldBinSettings(parkFieldBin({ vehicles: [], bins: {} }, { id: 'b2', name: 'Field bin 2' }));
    expect(parked.bins.b2).toEqual({ parkedName: 'Field bin 2' });
  });

  it('puts the same bin back and keeps its capacity', () => {
    const parked = parkFieldBin(settings, { id: 'b1', name: 'Field bin 1' });
    const placed = unparkFieldBin(parked, 'b1');
    expect(placed.bins.b1).toEqual({ capacityT: 90, cropLabel: 'Canola' });
  });

  it('lists a parked bin until a pin exists again', () => {
    const parked = parkFieldBin(settings, { id: 'b1', name: 'Field bin 1' });
    const off = fieldBinPlaces([], parked);
    expect(off).toEqual([{ id: 'b1', name: 'Field bin 1', lat: null, lng: null }]);
    const on = fieldBinPlaces(
      [{ id: 'b1', name: 'Field bin 1', type: 'field_bin', lat: -33.9, lng: 115.1 }],
      parked
    );
    expect(on[0]?.lat).toBe(-33.9);
    expect(on).toHaveLength(1);
  });
});
