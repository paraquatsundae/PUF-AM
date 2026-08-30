import { describe, expect, it } from 'vitest';
import {
  actualIrrigationByMonth,
  autoDistributePlan,
  avgKcFromBlocks,
  buildSeasonChartRows,
  createWaterScenario,
  displayToMm,
  etcCoveragePercent,
  getKcForMonth,
  irrigationTypeToStyle,
  mmToDisplay,
  planTotals,
  usedWaterMl,
} from './waterPlanning';

describe('waterPlanning', () => {
  it('maps irrigation system types to planner styles', () => {
    expect(irrigationTypeToStyle('micro')).toBe('micro-sprinkler');
    expect(irrigationTypeToStyle('surface_drip')).toBe('drip-tape');
    expect(irrigationTypeToStyle('sub_surface')).toBe('sdi');
    expect(irrigationTypeToStyle('flood')).toBe('flood');
  });

  it('weights canopy closure by block area for Kc', () => {
    expect(avgKcFromBlocks([])).toBe(1);
    expect(avgKcFromBlocks([{ areaHa: 10, canopyClosure: 50 }])).toBeCloseTo(0.975);
  });

  it('sums irrigation into the Jul–Jun season of the start year', () => {
    const actuals = actualIrrigationByMonth(
      [
        { type: 'irrigation', irrigationAmount: 10, date: '2026-08-15' },
        { type: 'irrigation', irrigationAmount: 5, date: '2027-01-10' },
        { type: 'irrigation', irrigationAmount: 99, date: '2025-08-01' },
        { type: 'spray', irrigationAmount: 20, date: '2026-08-15' },
      ],
      2026
    );
    expect(actuals.Aug).toBe(10);
    expect(actuals.Jan).toBe(5);
    expect(actuals.Jul).toBe(0);
  });

  it('converts mm ↔ ML and used water', () => {
    expect(usedWaterMl({ Jul: 10, Aug: 10 }, 50)).toBe(10);
    expect(displayToMm(5, 'ML', 50)).toBe(10);
    expect(mmToDisplay(10, 'ML', 50)).toBe(5);
    expect(planTotals({ Jul: 20, Aug: 30 }, 10)).toEqual({ totalMm: 50, totalMl: 5 });
    expect(etcCoveragePercent(50, 100)).toBe(50);
    expect(etcCoveragePercent(10, 0)).toBe(0);
  });

  it('auto-distributes budget toward rainfall deficit', () => {
    const next = autoDistributePlan(
      1,
      { Jul: 0, Aug: 100 },
      { Jul: 100, Aug: 0 },
      1
    );
    expect(next.Jul).toBeGreaterThan(0);
    expect(next.Aug).toBe(0);
  });

  it('builds cumulative chart rows', () => {
    const scenario = createWaterScenario('baseline', 'Baseline plan');
    scenario.data.Jul = 10;
    const rows = buildSeasonChartRows(
      { Jul: 20 },
      { Jul: 10 },
      { Jul: 5 },
      scenario.data,
      null,
      1
    );
    expect(rows[0].month).toBe('Jul');
    expect(rows[0].rainfall).toBe(20);
    expect(rows[0].activeScenario).toBe(10);
    expect(rows[0].comparisonScenario).toBeNull();
    expect(getKcForMonth('Jul', 1)).toBe(0.12);
  });
});
