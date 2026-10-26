import { describe, expect, it } from 'vitest';
import { recommendTruckBlend } from '../shared/farm/fieldBinBlend';
import { planTruckLoad } from '../shared/farm/fieldBinStock';

const trailers = [
  { id: 'a', capacityT: 22 },
  { id: 'b', capacityT: 25 },
];

describe('recommendTruckBlend', () => {
  it('fills trailer 1 from the first bin, then the next bin finishes it and the next trailer', () => {
    const blend = recommendTruckBlend({
      trailers,
      bins: [
        { id: 'b1', tonnes: 45, moisture: 8 },
        { id: 'b2', tonnes: 90, moisture: 10 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills).toEqual([
      { trailerId: 'a', binId: 'b1', percent: 71 },
      { trailerId: 'a', binId: 'b2', percent: 29 },
      { trailerId: 'b', binId: 'b2', percent: 100 },
    ]);
    const planned = planTruckLoad({
      trailers,
      fills: blend.fills,
      bins: {
        b1: { tonnes: 45, capacityT: 90, moisture: 8 },
        b2: { tonnes: 90, capacityT: 90, moisture: 10 },
      },
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.mixMoisture).toBeCloseTo((15.62 * 8 + 31.38 * 10) / 47, 5);
  });

  it('moves onto the next trailer when the first bin fills trailer 1', () => {
    const blend = recommendTruckBlend({
      trailers,
      bins: [
        { id: 'b1', tonnes: 90, moisture: 8 },
        { id: 'b2', tonnes: 45, moisture: 10 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills).toEqual([
      { trailerId: 'a', binId: 'b1', percent: 100 },
      { trailerId: 'b', binId: 'b1', percent: 37 },
      { trailerId: 'b', binId: 'b2', percent: 63 },
    ]);
  });

  it('fills a truck from the one bin that can take it', () => {
    const blend = recommendTruckBlend({
      trailers,
      bins: [
        { id: 'b1', tonnes: 0, moisture: null },
        { id: 'b2', tonnes: 90, moisture: 9 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills.every((fill) => fill.binId === 'b2' && fill.percent === 100)).toBe(true);
  });

  it('stops short when the bins do not hold a full truck', () => {
    const blend = recommendTruckBlend({
      trailers: [{ id: 'a', capacityT: 47 }],
      bins: [{ id: 'b1', tonnes: 20, moisture: 8 }],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills).toEqual([{ trailerId: 'a', binId: 'b1', percent: 42 }]);
  });

  it('leaves out a bin that has grain and no moisture', () => {
    const blend = recommendTruckBlend({
      trailers: [{ id: 'a', capacityT: 20 }],
      bins: [
        { id: 'dry', tonnes: 30, moisture: null },
        { id: 'wet', tonnes: 30, moisture: 11 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.skippedIds).toEqual(['dry']);
    expect(blend.fills).toEqual([{ trailerId: 'a', binId: 'wet', percent: 100 }]);
  });

  it('asks for a moisture when every bin with grain lacks one', () => {
    const blend = recommendTruckBlend({
      trailers,
      bins: [{ id: 'b1', tonnes: 45, moisture: null }],
    });
    expect(blend.ok).toBe(false);
    if (blend.ok === false) expect(blend.error).toMatch(/moisture/);
  });

  it('does not draw more than a small bin is holding', () => {
    const blend = recommendTruckBlend({
      trailers: [{ id: 'a', capacityT: 100 }],
      bins: [
        { id: 'small', tonnes: 0.6, moisture: 8 },
        { id: 'big', tonnes: 10, moisture: 12 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    const planned = planTruckLoad({
      trailers: [{ id: 'a', capacityT: 100 }],
      fills: blend.fills,
      bins: {
        small: { tonnes: 0.6, capacityT: 90, moisture: 8 },
        big: { tonnes: 10, capacityT: 90, moisture: 12 },
      },
    });
    expect(planned.ok).toBe(true);
    expect(blend.fills.find((fill) => fill.binId === 'small')).toBeUndefined();
    expect(blend.fills.find((fill) => fill.binId === 'big')?.percent).toBe(9);
  });
});
