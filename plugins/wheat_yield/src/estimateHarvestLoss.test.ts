import { describe, expect, it } from 'vitest';
import {
  customTrayAreaM2,
  gramsFromCount,
  parseHarvestLossCalculations,
  planHarvestLoss,
  trayAreaM2,
  trayKgPerHa,
} from './estimateHarvestLoss';

describe('drop tray harvest loss', () => {
  it('uses the three tray areas', () => {
    expect(trayAreaM2('square30')).toBeCloseTo(0.09);
    expect(trayAreaM2('round30')).toBeCloseTo(Math.PI * 0.15 * 0.15);
    expect(trayAreaM2('long')).toBeCloseTo(0.375);
  });

  it('turns a weighed tray into kilograms per hectare on the ground', () => {
    expect(trayKgPerHa(2, 0.09)).toBeCloseTo((2 * 10) / 0.09);
    expect(trayKgPerHa(1, 0.5)).toBeCloseTo(20);
  });

  it('treats 290 canola grains as one gram', () => {
    expect(gramsFromCount(290, 290)).toBeCloseTo(1);
    expect(trayKgPerHa(gramsFromCount(290, 290) ?? 0, 0.09)).toBeCloseTo(trayKgPerHa(1, 0.09)!);
  });

  it('averages bands, then scales the spread back to the header', () => {
    const planned = planHarvestLoss({
      headerM: 12,
      spreadM: 6,
      grainsPerGram: 290,
      drops: [
        { tray: 'square30', zone: 'l2', grams: 0.9 },
        { tray: 'square30', zone: 'c', grams: 1.8 },
        { tray: 'square30', zone: 'c', grams: 0 },
      ],
    });
    expect(planned.ok).toBe(true);
    if (planned.ok !== true) return;
    const left = (0.9 * 10) / 0.09;
    const centre = ((1.8 * 10) / 0.09 + 0) / 2;
    expect(planned.groundKgPerHa).toBeCloseTo((left + centre) / 2);
    expect(planned.kgPerHa).toBeCloseTo(planned.groundKgPerHa * 0.5);
    expect(planned.bandsUsed).toBe(2);
    expect(planned.dropCount).toBe(3);
  });

  it('averages different tray areas in one band, and reports each band', () => {
    const shop = {
      id: 'shoptray1',
      label: 'Shop',
      shape: 'rect' as const,
      widthCm: 40,
      lengthCm: 20,
    };
    const planned = planHarvestLoss({
      headerM: 12,
      spreadM: 12,
      grainsPerGram: 290,
      trays: [shop],
      drops: [
        { tray: 'square30', zone: 'l1', grams: 2 },
        { tray: 'shoptray1', zone: 'c', grams: 2 },
      ],
    });
    expect(planned.ok).toBe(true);
    if (planned.ok !== true) return;
    const square = (2 * 10) / 0.09;
    const shopLoss = (2 * 10) / 0.08;
    expect(planned.bands.find((band) => band.zone === 'l1')?.kgPerHa).toBeCloseTo(square);
    expect(planned.bands.find((band) => band.zone === 'c')?.kgPerHa).toBeCloseTo(shopLoss);
    expect(planned.bands.find((band) => band.zone === 'r1')?.kgPerHa).toBeNull();
    expect(planned.groundKgPerHa).toBeCloseTo((square + shopLoss) / 2);
  });

  it('keeps a custom tray area and drops a tray with no size', () => {
    expect(customTrayAreaM2({ shape: 'rect', widthCm: 40, lengthCm: 20 })).toBeCloseTo(0.08);
    expect(customTrayAreaM2({ shape: 'round', widthCm: 20, lengthCm: 20 })).toBeCloseTo(Math.PI * 0.1 * 0.1);
    const kept = parseHarvestLossCalculations([
      {
        id: 'c1',
        cropId: 'canola',
        headerM: 12,
        spreadM: 12,
        drops: [{ tray: 'shoptray1', zone: 'l2', grams: 2, areaM2: 0.08 }],
      },
    ]);
    expect(kept[0]?.drops[0]).toEqual({ tray: 'shoptray1', zone: 'l2', grams: 2, areaM2: 0.08 });
    const dropped = parseHarvestLossCalculations([
      {
        id: 'c1',
        cropId: 'canola',
        headerM: 12,
        spreadM: 12,
        drops: [{ tray: 'shoptray1', zone: 'l2', grams: 2 }],
      },
    ]);
    expect(dropped[0]?.drops).toEqual([]);
  });

  it('keeps a saved calculation and drops an unknown crop', () => {
    const kept = parseHarvestLossCalculations([
      {
        id: 'c1',
        cropId: 'wheat',
        headerM: 12,
        spreadM: 12,
        drops: [{ tray: 'round30', zone: 'c', grains: 27 }],
      },
      { id: 'c2', cropId: 'rice', headerM: 12, spreadM: 12, drops: [] },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.drops[0]).toEqual({ tray: 'round30', zone: 'c', grains: 27 });
  });
});
