import { describe, expect, it } from 'vitest';
import { eyeFractionLabel, recommendTruckBlend } from '../shared/farm/fieldBinBlend';
import { parseFieldBinSettings } from '../shared/farm/fieldBinStock';
import { planTruckLoad } from '../shared/farm/fieldBinStock';

const three = [
  { id: 'a', capacityT: 20 },
  { id: 'b', capacityT: 20 },
  { id: 'c', capacityT: 20 },
];

function trailerMoisture(
  fills: { trailerId: string; binId: string; percent: number }[],
  trailer: { id: string; capacityT: number },
  moist: Record<string, number>
): number {
  let tonnes = 0;
  let sum = 0;
  for (const fill of fills.filter((row) => row.trailerId === trailer.id)) {
    const taken = (fill.percent / 100) * trailer.capacityT;
    tonnes += taken;
    sum += taken * (moist[fill.binId] ?? 0);
  }
  return tonnes > 0 ? sum / tonnes : 0;
}

describe('recommendTruckBlend', () => {
  it('names the eye fractions and does not call a 6% sliver a percent', () => {
    expect(eyeFractionLabel(25)).toBe('1/4');
    expect(eyeFractionLabel(33)).toBe('1/3');
    expect(eyeFractionLabel(100)).toBe('4/4');
    expect(eyeFractionLabel(6)).toBeNull();
  });
  it('pours a 50/50 blend along the trailers instead of splitting every trailer the same way', () => {
    const blend = recommendTruckBlend({
      trailers: three,
      deliverAt: 10,
      trailerMax: 12,
      bins: [
        { id: 'b1', tonnes: 100, moisture: 8 },
        { id: 'b2', tonnes: 100, moisture: 12 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills).toEqual([
      { trailerId: 'a', binId: 'b1', percent: 100 },
      { trailerId: 'b', binId: 'b1', percent: 50 },
      { trailerId: 'b', binId: 'b2', percent: 50 },
      { trailerId: 'c', binId: 'b2', percent: 100 },
    ]);
  });

  it('keeps a 8.5% canola delivery with no trailer over 9%', () => {
    const trailers = [
      { id: 'a', capacityT: 30 },
      { id: 'b', capacityT: 30 },
      { id: 'c', capacityT: 30 },
    ];
    const blend = recommendTruckBlend({
      trailers,
      deliverAt: 8.5,
      trailerMax: 9,
      bins: [
        { id: 'b1', tonnes: 200, moisture: 8 },
        { id: 'b2', tonnes: 200, moisture: 10 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills).toEqual([
      { trailerId: 'a', binId: 'b1', percent: 100 },
      { trailerId: 'b', binId: 'b1', percent: 75 },
      { trailerId: 'b', binId: 'b2', percent: 25 },
      { trailerId: 'c', binId: 'b1', percent: 50 },
      { trailerId: 'c', binId: 'b2', percent: 50 },
    ]);
    const moist = { b1: 8, b2: 10 };
    for (const trailer of trailers) {
      expect(trailerMoisture(blend.fills, trailer, moist)).toBeLessThanOrEqual(9 + 1e-6);
    }
    const planned = planTruckLoad({
      trailers,
      fills: blend.fills,
      bins: {
        b1: { tonnes: 200, capacityT: 200, moisture: 8 },
        b2: { tonnes: 200, capacityT: 200, moisture: 10 },
      },
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.mixMoisture).toBeCloseTo(8.5, 5);
  });

  it('puts a small correction in the first trailer and finishes from the next bins', () => {
    const blend = recommendTruckBlend({
      trailers: three,
      deliverAt: 8.7,
      trailerMax: 9,
      bins: [
        { id: 'b1', tonnes: 100, moisture: 6 },
        { id: 'b2', tonnes: 30, moisture: 9 },
        { id: 'b3', tonnes: 100, moisture: 9 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills).toEqual([
      { trailerId: 'a', binId: 'b1', percent: 33 },
      { trailerId: 'a', binId: 'b2', percent: 67 },
      { trailerId: 'b', binId: 'b2', percent: 75 },
      { trailerId: 'b', binId: 'b3', percent: 25 },
      { trailerId: 'c', binId: 'b3', percent: 100 },
    ]);
  });

  it('fills from the first bin when every bin is already under the delivery moisture', () => {
    const blend = recommendTruckBlend({
      trailers: [
        { id: 'a', capacityT: 22 },
        { id: 'b', capacityT: 25 },
      ],
      deliverAt: 8.5,
      trailerMax: 8.5,
      bins: [
        { id: 'b1', tonnes: 45, moisture: 8 },
        { id: 'b2', tonnes: 90, moisture: 7 },
      ],
    });
    expect(blend.ok).toBe(true);
    if (!blend.ok) return;
    expect(blend.fills).toEqual([
      { trailerId: 'a', binId: 'b1', percent: 100 },
      { trailerId: 'b', binId: 'b1', percent: 75 },
      { trailerId: 'b', binId: 'b2', percent: 25 },
    ]);
  });

  it('refuses a load when every bin is wetter than the delivery moisture', () => {
    const blend = recommendTruckBlend({
      trailers: three,
      deliverAt: 8.5,
      trailerMax: 9,
      bins: [
        { id: 'b1', tonnes: 40, moisture: 9.2 },
        { id: 'b2', tonnes: 40, moisture: 10 },
      ],
    });
    expect(blend.ok).toBe(false);
    if (blend.ok === false) expect(blend.error).toMatch(/above 8\.5%/);
  });

  it('refuses a trailer limit under the delivery moisture', () => {
    const blend = recommendTruckBlend({
      trailers: three,
      deliverAt: 8.5,
      trailerMax: 8,
      bins: [{ id: 'b1', tonnes: 100, moisture: 8 }],
    });
    expect(blend.ok).toBe(false);
    if (blend.ok === false) expect(blend.error).toMatch(/trailer limit/);
  });

  it('leaves out a bin that has grain and no moisture', () => {
    const blend = recommendTruckBlend({
      trailers: [{ id: 'a', capacityT: 20 }],
      deliverAt: 12,
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
      trailers: [{ id: 'a', capacityT: 20 }],
      deliverAt: 8,
      bins: [{ id: 'b1', tonnes: 45, moisture: null }],
    });
    expect(blend.ok).toBe(false);
    if (blend.ok === false) expect(blend.error).toMatch(/moisture/);
  });

  it('does not draw more than a small bin is holding', () => {
    const blend = recommendTruckBlend({
      trailers: [{ id: 'a', capacityT: 100 }],
      deliverAt: 12,
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
    expect(blend.fills.find((fill) => fill.binId === 'big')?.percent).toBe(10);
  });

  it('keeps a CBH grade override and drops an unknown grade', () => {
    const kept = parseFieldBinSettings({
      vehicles: [],
      bins: {},
      receival: { gradeId: 'cag1', deliverAt: 8.5, trailerMax: 9 },
    });
    expect(kept.receival).toEqual({ gradeId: 'cag1', deliverAt: 8.5, trailerMax: 9 });
    const dropped = parseFieldBinSettings({
      vehicles: [],
      bins: {},
      receival: { gradeId: 'esperance', deliverAt: 8.5, trailerMax: 9 },
    });
    expect(dropped.receival).toBeUndefined();
  });
});
