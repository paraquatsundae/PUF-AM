/** Shared water-page helpers (keep WaterMonitoring from growing). */

export type WaterScenario = {
  id: string;
  name: string;
  budgetGoal: number;
  data: Record<string, number>;
};

export type WaterChartRow = {
  month: string;
  rainfall: number;
  etc: number;
  recommended: number;
  applied: number;
  activeScenario: number;
  comparisonScenario: number | null;
  totalWater: number;
  balance: number;
};

export const WATER_SEASON_MONTHS = [
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
] as const;

export const CALENDAR_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const KC_CURVE = [0.95, 0.85, 0.65, 0.35, 0.15, 0.12, 0.12, 0.12, 0.12, 0.15, 0.35, 0.65];

export function irrigationTypeToStyle(type: string): string {
  switch (type) {
    case 'surface_drip':
      return 'drip-tape';
    case 'sub_surface':
      return 'sdi';
    case 'flood':
      return 'flood';
    default:
      return 'micro-sprinkler';
  }
}

export function irrigationStyleLabel(type: string | undefined): string {
  switch (type) {
    case 'surface_drip':
      return 'Surface drip';
    case 'sub_surface':
      return 'SDI';
    case 'flood':
      return 'Flood';
    default:
      return 'Micro-sprinkler';
  }
}

export function emptyScenarioData(): Record<string, number> {
  return Object.fromEntries(WATER_SEASON_MONTHS.map((m) => [m, 0]));
}

export function createWaterScenario(id: string, name: string, budgetGoal = 8.5): WaterScenario {
  return { id, name, budgetGoal, data: emptyScenarioData() };
}

export function avgKcFromBlocks(
  blocks: { areaHa?: number; canopyClosure?: number }[]
): number {
  if (blocks.length === 0) return 1.0;
  const totalArea = blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0) || 1;
  let weightedClosure = 0;
  blocks.forEach((b) => {
    const area = b.areaHa || totalArea / blocks.length;
    const closure = b.canopyClosure || 50;
    weightedClosure += closure * area;
  });
  return 0.8 + (weightedClosure / totalArea / 100) * 0.35;
}

export function getKcForMonth(monthName: string, avgKc: number): number {
  const monthIndex = CALENDAR_MONTHS.indexOf(monthName as (typeof CALENDAR_MONTHS)[number]);
  if (monthIndex < 0) return avgKc;
  return KC_CURVE[monthIndex] * avgKc;
}

export function isDateInWaterSeason(date: Date, seasonStartYear: number): boolean {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  return (
    (monthIndex >= 6 && year === seasonStartYear) ||
    (monthIndex < 6 && year === seasonStartYear + 1)
  );
}

export function actualIrrigationByMonth(
  events: { type: string; irrigationAmount?: number; date: string }[],
  seasonStartYear: number
): Record<string, number> {
  const actuals: Record<string, number> = emptyScenarioData();
  events.forEach((e) => {
    if (e.type !== 'irrigation' || !e.irrigationAmount) return;
    const date = new Date(e.date);
    const monthName = CALENDAR_MONTHS[date.getMonth()];
    if (isDateInWaterSeason(date, seasonStartYear) && actuals[monthName] !== undefined) {
      actuals[monthName] += e.irrigationAmount;
    }
  });
  return actuals;
}

export function usedWaterMl(actuals: Record<string, number>, farmSizeHa: number): number {
  const totalMm = Object.values(actuals).reduce((sum, val) => sum + val, 0);
  return Number(((totalMm * farmSizeHa) / 100).toFixed(1));
}

export function displayToMm(value: number, unit: 'mm' | 'ML', farmSizeHa: number): number {
  if (unit === 'ML' && farmSizeHa > 0) return (value * 100) / farmSizeHa;
  return value;
}

export function mmToDisplay(mm: number, unit: 'mm' | 'ML', farmSizeHa: number): number {
  if (unit === 'ML' && farmSizeHa > 0) return (mm * farmSizeHa) / 100;
  return mm;
}

export function planTotals(
  data: Record<string, number>,
  farmSizeHa: number
): { totalMm: number; totalMl: number } {
  const totalMm = Object.values(data).reduce((sum, val) => sum + val, 0);
  return { totalMm, totalMl: farmSizeHa > 0 ? (totalMm * farmSizeHa) / 100 : 0 };
}

export function etcCoveragePercent(planMm: number, totalEtc: number): number {
  if (totalEtc <= 0) return 0;
  return Math.min(100, Math.round((planMm / totalEtc) * 100));
}

export function autoDistributePlan(
  budgetMlPerHa: number,
  rainfall: Record<string, number>,
  et0: Record<string, number>,
  avgKc: number
): Record<string, number> {
  const budgetMm = budgetMlPerHa * 100;
  const deficits = WATER_SEASON_MONTHS.map((month) => {
    const etc = (et0[month] || 0) * getKcForMonth(month, avgKc);
    const rain = rainfall[month] || 0;
    return { month, deficit: Math.max(0, etc - rain) };
  });
  const totalDeficit = deficits.reduce((sum, d) => sum + d.deficit, 0);
  const next: Record<string, number> = {};
  deficits.forEach((d) => {
    next[d.month] =
      totalDeficit > 0 ? Number(Math.min(d.deficit, budgetMm * (d.deficit / totalDeficit)).toFixed(1)) : 0;
  });
  return next;
}

export function buildSeasonChartRows(
  rainfall: Record<string, number>,
  et0: Record<string, number>,
  applied: Record<string, number>,
  active: Record<string, number>,
  comparison: Record<string, number> | null,
  avgKc: number
): WaterChartRow[] {
  let cumulativeRain = 0;
  let cumulativeEtc = 0;
  let cumulativeApplied = 0;
  return WATER_SEASON_MONTHS.map((month) => {
    const rain = Math.round(rainfall[month] || 0);
    const etc = Math.round((et0[month] || 0) * getKcForMonth(month, avgKc));
    const appliedMm = Math.round(applied[month] || 0);
    const activeValue = active[month] || 0;
    const comparisonValue = comparison ? comparison[month] || 0 : null;
    cumulativeRain += rain;
    cumulativeEtc += etc;
    cumulativeApplied += appliedMm;
    return {
      month,
      rainfall: rain,
      etc,
      recommended: etc,
      applied: appliedMm,
      activeScenario: activeValue,
      comparisonScenario: comparisonValue,
      totalWater: rain + activeValue,
      balance: Math.round(cumulativeRain + cumulativeApplied - cumulativeEtc),
    };
  });
}
