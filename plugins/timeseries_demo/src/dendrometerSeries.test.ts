import { describe, expect, it } from 'vitest';
import { DEMO_DENDROMETER_SERIES, DEMO_RANGE_START, DEMO_RANGE_END } from './demoSeries';
import { filterDendrometerSeries, normalizeDendrometersByRangeMinimum } from './dendrometerSeries';

describe('fixed dendrometer fixture', () => {
  it('covers two years with one finite daily reading per sensor', () => {
    expect(DEMO_RANGE_START).toBe('2024-09-01');
    expect(DEMO_RANGE_END).toBe('2026-08-31');
    expect(DEMO_DENDROMETER_SERIES).toHaveLength(730);
    DEMO_DENDROMETER_SERIES.forEach((row, index, rows) => {
      expect(Number.isFinite(row.sensorA) && Number.isFinite(row.sensorB)).toBe(true);
      if (index > 0) expect(Date.parse(row.date) - Date.parse(rows[index - 1].date)).toBe(86_400_000);
    });
  });
});

describe('range-minimum normalization', () => {
  const readings = [
    { date: '2026-01-01', sensorA: 10, sensorB: 40 },
    { date: '2026-01-02', sensorA: 14, sensorB: 35 },
    { date: '2026-01-03', sensorA: 12, sensorB: 38 },
  ];

  it('subtracts a separate minimum for each sensor, not the first value or a shared minimum', () => {
    const result = normalizeDendrometersByRangeMinimum(readings);
    expect(result.map(row => [row.sensorANormalized, row.sensorBNormalized])).toEqual([
      [0, 5], [4, 0], [2, 3],
    ]);
    expect(readings[0]).toEqual({ date: '2026-01-01', sensorA: 10, sensorB: 40 });
  });

  it('recalculates minima from only the selected inclusive range', () => {
    const selected = filterDendrometerSeries(readings, '2026-01-02', '2026-01-03');
    expect(selected).toHaveLength(2);
    expect(normalizeDendrometersByRangeMinimum(selected).map(row => row.sensorANormalized)).toEqual([2, 0]);
  });

  it('handles empty ranges and a single-day range', () => {
    expect(normalizeDendrometersByRangeMinimum([])).toEqual([]);
    const selected = filterDendrometerSeries(readings, '2026-01-02', '2026-01-02');
    expect(normalizeDendrometersByRangeMinimum(selected)[0]).toMatchObject({ sensorANormalized: 0, sensorBNormalized: 0 });
  });

  it('rounds decimal differences to the fixture precision', () => {
    const rows = [{ date: 'a', sensorA: 0.1, sensorB: 0.2 }, { date: 'b', sensorA: 0.3, sensorB: 0.3 }];
    expect(normalizeDendrometersByRangeMinimum(rows)[1]).toMatchObject({ sensorANormalized: 0.2, sensorBNormalized: 0.1 });
  });
});
