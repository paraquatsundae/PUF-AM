import { describe, expect, it } from 'vitest';
import {
  capacityChangeError,
  parseFieldBinMovement,
  parseFieldBinSettings,
  truckColorId,
  planTruckLoad,
  planTransfer,
  settingsToWrite,
  levelChangeError,
  moistureChangeError,
  stockByBin,
  stockByVehicle,
  truckCapacityT,
  type FieldBinMovement,
} from '../shared/farm/fieldBinStock';

const bins = {
  b1: { tonnes: 100, capacityT: 200, moisture: 14 },
  b3: { tonnes: 50, capacityT: 200, moisture: 10 },
};

describe('field bin stock', () => {
  it('takes a percent of each bin onto a truck', () => {
    const planned = planTransfer({
      vehicleCapacityT: 40,
      direction: 'out',
      lines: [
        { binId: 'b1', percent: 20, base: 'bin' },
        { binId: 'b3', percent: 80, base: 'bin' },
      ],
      bins,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.lines.map((line) => line.tonnes)).toEqual([20, 40]);
    expect(planned.mixMoisture).toBeCloseTo(11.333, 2);
  });

  it('splits one vehicle load across bins', () => {
    const planned = planTransfer({
      vehicleCapacityT: 40,
      direction: 'out',
      lines: [
        { binId: 'b1', percent: 20, base: 'load' },
        { binId: 'b3', percent: 80, base: 'load' },
      ],
      bins,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.lines.map((line) => line.tonnes)).toEqual([8, 32]);
    expect(planned.mixMoisture).toBeCloseTo(10.8, 5);
  });

  it('refuses load percents that add up past one load', () => {
    const planned = planTransfer({
      vehicleCapacityT: 40,
      direction: 'out',
      lines: [
        { binId: 'b1', percent: 60, base: 'load' },
        { binId: 'b3', percent: 50, base: 'load' },
      ],
      bins,
    });
    expect(planned.ok).toBe(false);
  });

  it('refuses a tip that would overfill the bin', () => {
    const planned = planTransfer({
      vehicleCapacityT: 30,
      direction: 'in',
      moisture: 12,
      lines: [{ binId: 'b1', percent: 100, base: 'load' }],
      bins: { b1: { tonnes: 90, capacityT: 100, moisture: 14 } },
    });
    expect(planned.ok).toBe(false);
  });

  it('keeps the bin average when grain leaves and updates it when grain arrives', () => {
    const movements: FieldBinMovement[] = [
      {
        id: 'a',
        at: '2026-10-01T00:00:00.000Z',
        vehicleId: 'c1',
        direction: 'in',
        moisture: 14,
        lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 100 }],
      },
      {
        id: 'b',
        at: '2026-10-02T00:00:00.000Z',
        vehicleId: 't1',
        direction: 'out',
        mixMoisture: 14,
        lines: [{ binId: 'b1', percent: 20, base: 'bin', tonnes: 20 }],
      },
      {
        id: 'c',
        at: '2026-10-03T00:00:00.000Z',
        vehicleId: 'c1',
        direction: 'in',
        moisture: 10,
        lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 20 }],
      },
    ];
    const afterOut = stockByBin(movements.slice(0, 2)).b1;
    expect(afterOut).toEqual({ tonnes: 80, moisture: 14 });
    const afterIn = stockByBin(movements).b1;
    expect(afterIn.tonnes).toBe(100);
    expect(afterIn.moisture).toBeCloseTo(13.2, 5);
  });

  it('tips half a chaser into one bin', () => {
    const planned = planTransfer({
      vehicleCapacityT: 20,
      direction: 'in',
      moisture: 13.5,
      lines: [{ binId: 'b1', percent: 50, base: 'load' }],
      bins: { b1: { tonnes: 0, capacityT: 200, moisture: null } },
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.lines[0]?.tonnes).toBe(10);
  });

  it('keeps a chaser scales flag on the settings document', () => {
    const parsed = settingsToWrite(
      parseFieldBinSettings({
        vehicles: [{ id: 'c1', kind: 'chaser', name: 'Cart', capacityT: 20, scales: true }],
        bins: {},
      })
    );
    expect(parsed.vehicles[0]?.scales).toBe(true);
  });

  it('mixes a truck from two bins across two trailers', () => {
    const planned = planTruckLoad({
      trailers: [
        { id: 'a', capacityT: 30 },
        { id: 'b', capacityT: 20 },
      ],
      fills: [
        { trailerId: 'a', binId: 'b1', percent: 50 },
        { trailerId: 'a', binId: 'b3', percent: 50 },
        { trailerId: 'b', binId: 'b1', percent: 100 },
      ],
      bins,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.lines.map((line) => line.tonnes)).toEqual([15, 15, 20]);
    expect(planned.mixMoisture).toBeCloseTo(12.8, 5);
    expect(truckCapacityT([{ id: 'a', capacityT: 30 }, { id: 'b', capacityT: 20 }])).toBe(50);
  });

  it('refuses a draw that empties a bin across more than one trailer', () => {
    const planned = planTruckLoad({
      trailers: [
        { id: 'a', capacityT: 80 },
        { id: 'b', capacityT: 40 },
      ],
      fills: [
        { trailerId: 'a', binId: 'b1', percent: 100 },
        { trailerId: 'b', binId: 'b1', percent: 100 },
      ],
      bins,
    });
    expect(planned.ok).toBe(false);
  });

  it('refuses trailer percents that fill one trailer past full', () => {
    const planned = planTruckLoad({
      trailers: [{ id: 'a', capacityT: 30 }],
      fills: [
        { trailerId: 'a', binId: 'b1', percent: 60 },
        { trailerId: 'a', binId: 'b3', percent: 50 },
      ],
      bins,
    });
    expect(planned.ok).toBe(false);
  });

  it('stores trailers on the truck and the trailer id on each line', () => {
    const settings = settingsToWrite(
      parseFieldBinSettings({
        vehicles: [
          {
            id: 't1',
            kind: 'truck',
            name: 'Road train',
            capacityT: 1,
            trailers: [
              { id: 'a', capacityT: 30 },
              { id: 'b', capacityT: 20 },
            ],
          },
        ],
        bins: {},
      })
    );
    expect(settings.vehicles[0]?.capacityT).toBe(50);
    expect(settings.vehicles[0]?.trailers).toEqual([
      { id: 'a', capacityT: 30 },
      { id: 'b', capacityT: 20 },
    ]);
    const movement = parseFieldBinMovement({
      id: 'm1',
      at: '2026-10-26T00:00:00.000Z',
      vehicleId: 't1',
      direction: 'out',
      mixMoisture: 12.8,
      lines: [{ binId: 'b1', percent: 50, base: 'trailer', tonnes: 15, trailerId: 'a' }],
    });
    expect(movement?.lines[0]?.trailerId).toBe('a');
    expect(movement?.mixMoisture).toBe(12.8);
  });

  it('keeps a known truck colour and drops an unknown one', () => {
    const kept = settingsToWrite(
      parseFieldBinSettings({
        vehicles: [{ id: 't', kind: 'truck', name: 'Mack', capacityT: 40, color: 'teal' }],
        bins: {},
      })
    );
    expect(kept.vehicles[0]?.color).toBe('teal');
    const dropped = parseFieldBinSettings({
      vehicles: [{ id: 't', kind: 'truck', name: 'Mack', capacityT: 40, color: 'rainbow' }],
      bins: {},
    });
    expect(dropped.vehicles[0]?.color).toBeUndefined();
    expect(truckColorId(undefined, 1)).toBe('red');
  });

  it('empties a bin or a vehicle without moving that grain onto the other', () => {
    const intoBin: FieldBinMovement = {
      id: 'in',
      at: '2026-10-26T00:00:00.000Z',
      vehicleId: 'chaser',
      direction: 'in',
      moisture: 8.3,
      lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 40 }],
    };
    const ontoTruck: FieldBinMovement = {
      id: 'out',
      at: '2026-10-26T00:30:00.000Z',
      vehicleId: 'truck',
      direction: 'out',
      mixMoisture: 8.3,
      lines: [{ binId: 'b1', percent: 25, base: 'bin', tonnes: 10 }],
    };
    const binClear = parseFieldBinMovement({
      id: 'bin-clear',
      at: '2026-10-26T01:00:00.000Z',
      vehicleId: 'clear',
      direction: 'out',
      clear: 'bin',
      mixMoisture: 8.3,
      lines: [{ binId: 'b1', percent: 100, base: 'bin', tonnes: 40 }],
    });
    expect(binClear?.clear).toBe('bin');
    expect(stockByBin([intoBin, binClear!]).b1).toEqual({ tonnes: 0, moisture: null });
    expect(stockByVehicle([ontoTruck, binClear!]).truck?.tonnes).toBe(10);

    const vehicleClear = parseFieldBinMovement({
      id: 'truck-clear',
      at: '2026-10-26T02:00:00.000Z',
      vehicleId: 'truck',
      direction: 'out',
      clear: 'vehicle',
      lines: [],
    });
    expect(vehicleClear?.clear).toBe('vehicle');
    expect(stockByVehicle([ontoTruck, vehicleClear!]).truck).toEqual({ tonnes: 0, moisture: null });
    expect(stockByBin([intoBin, ontoTruck, vehicleClear!]).b1?.tonnes).toBe(30);
    expect(parseFieldBinMovement({ ...vehicleClear, lines: ontoTruck.lines })).toBeNull();
  });

  it('sets a bin level and keeps the moisture already on the grain', () => {
    const intoBin: FieldBinMovement = {
      id: 'in',
      at: '2026-10-26T00:00:00.000Z',
      vehicleId: 'chaser',
      direction: 'in',
      moisture: 9,
      lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 40 }],
    };
    const setLevel = parseFieldBinMovement({
      id: 'set',
      at: '2026-10-26T01:00:00.000Z',
      vehicleId: 'level',
      direction: 'out',
      setLevel: true,
      lines: [{ binId: 'b1', percent: 0, base: 'bin', tonnes: 12 }],
    });
    expect(setLevel?.setLevel).toBe(true);
    expect(stockByBin([intoBin, setLevel!]).b1).toEqual({ tonnes: 12, moisture: 9 });
    const emptied = parseFieldBinMovement({
      ...setLevel,
      id: 'empty',
      at: '2026-10-26T02:00:00.000Z',
      lines: [{ binId: 'b1', percent: 0, base: 'bin', tonnes: 0 }],
    });
    expect(stockByBin([intoBin, setLevel!, emptied!]).b1).toEqual({ tonnes: 0, moisture: null });
    expect(stockByVehicle([intoBin, setLevel!]).chaser?.tonnes ?? 0).toBe(0);
    expect(levelChangeError(90, 100)).toMatch(/capacity/);
    expect(levelChangeError(90, 90)).toBeNull();
    expect(levelChangeError(90, 40)).toBeNull();
  });

  it('sets a bin moisture without changing the tonnes', () => {
    const intoBin: FieldBinMovement = {
      id: 'in',
      at: '2026-10-26T00:00:00.000Z',
      vehicleId: 'chaser',
      direction: 'in',
      moisture: 9,
      lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 40 }],
    };
    const setMoisture = parseFieldBinMovement({
      id: 'moist',
      at: '2026-10-26T01:00:00.000Z',
      vehicleId: 'moisture',
      direction: 'out',
      setMoisture: true,
      moisture: 12.5,
      lines: [{ binId: 'b1', percent: 0, base: 'bin', tonnes: 40 }],
    });
    expect(setMoisture?.setMoisture).toBe(true);
    expect(setMoisture?.moisture).toBe(12.5);
    expect(stockByBin([intoBin, setMoisture!]).b1).toEqual({ tonnes: 40, moisture: 12.5 });
    expect(stockByVehicle([intoBin, setMoisture!]).chaser?.tonnes ?? 0).toBe(0);
    const later = parseFieldBinMovement({
      id: 'later',
      at: '2026-10-26T02:00:00.000Z',
      vehicleId: 'chaser',
      direction: 'in',
      moisture: 8,
      lines: [{ binId: 'b1', percent: 100, base: 'load', tonnes: 10 }],
    });
    expect(stockByBin([intoBin, setMoisture!, later!]).b1?.moisture).toBeCloseTo(11.6, 5);
    expect(parseFieldBinMovement({ ...setMoisture, moisture: undefined })).toBeNull();
    expect(parseFieldBinMovement({ ...setMoisture, setLevel: true })).toBeNull();
    const onEmpty = parseFieldBinMovement({
      ...setMoisture,
      id: 'empty-moist',
      lines: [{ binId: 'b2', percent: 0, base: 'bin', tonnes: 0 }],
    });
    expect(stockByBin([onEmpty!]).b2).toBeUndefined();
    expect(moistureChangeError(0, 8)).toMatch(/grain/);
    expect(moistureChangeError(40, 101)).toMatch(/100/);
    expect(moistureChangeError(40, 8.4)).toBeNull();
  });

  it('refuses a capacity smaller than the grain already in the bin', () => {
    expect(capacityChangeError(80, 50)).toMatch(/below/);
    expect(capacityChangeError(80, 100)).toBeNull();
  });
});
