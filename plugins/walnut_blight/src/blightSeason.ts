import type { GrowthStage } from './blightModel';

export const seasonMonthsList = [
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

/** Jul–Jun month numbers (UTC) for custom historical range. */
const SEASON_MONTH_MAP = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];

export const BLIGHT_STAGE_CHIP: Record<GrowthStage, { color: string; textColor: string }> = {
  dormant: { color: 'bg-slate-200', textColor: 'text-slate-600' },
  bud_break: { color: 'bg-lime-200', textColor: 'text-lime-800' },
  bloom: { color: 'bg-emerald-200', textColor: 'text-emerald-700' },
  post_bloom: { color: 'bg-blue-200', textColor: 'text-blue-700' },
  shell_hardening: { color: 'bg-amber-200', textColor: 'text-amber-700' },
};

/**
 * How many days past the last observation to project the persistence "forecast".
 * DPIRD provides observations only, so beyond the last obs the chart just carries
 * the last known weather forward — we cap that to a short, honest window.
 */
export const FORECAST_HORIZON_DAYS = 7;

export type BlightTimeRange = '1M' | '3M' | '6M' | '1Y' | 'Custom';

export function getCurrentSeasonStr(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 6) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}-${year.toString().slice(-2)}`;
}

export function todayDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ji daily risk is often << 0.01; plain toFixed(2) collapses everything to 0.00. */
export function formatRiskValue(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) < 0.001) return v.toExponential(1);
  if (Math.abs(v) < 1) return v.toFixed(3);
  return v.toFixed(2);
}

export function seasonBounds(selectedSeason: string): { seasonStart: number; seasonEnd: number } {
  const [startYearStr, endYearSuffixStr] = selectedSeason.split('-');
  const startYear = parseInt(startYearStr, 10);
  const fullEndYear = 2000 + parseInt(endYearSuffixStr, 10);
  return {
    seasonStart: new Date(`${startYear}-07-01T00:00:00Z`).getTime(),
    seasonEnd: new Date(`${fullEndYear}-06-30T23:59:59Z`).getTime(),
  };
}

export function filterBySeasonAndRange<T extends { timestamp: number; fullDate?: string }>(
  data: T[],
  opts: {
    selectedSeason: string;
    timeRange: BlightTimeRange;
    customStartMonth: number;
    customEndMonth: number;
    todayStr?: string;
  }
): T[] {
  const { seasonStart, seasonEnd } = seasonBounds(opts.selectedSeason);
  let seasonData = data.filter((d) => d.timestamp >= seasonStart && d.timestamp <= seasonEnd);
  if (opts.todayStr) {
    seasonData = seasonData.filter((d) => !d.fullDate || d.fullDate <= opts.todayStr!);
  }
  if (seasonData.length === 0) return [];

  if (opts.timeRange === 'Custom') {
    const allowedMonths = SEASON_MONTH_MAP.slice(opts.customStartMonth, opts.customEndMonth + 1);
    return seasonData.filter((d) => allowedMonths.includes(new Date(d.timestamp).getUTCMonth()));
  }
  if (opts.timeRange === '1Y') return seasonData;

  let daysToSubtract = 365;
  if (opts.timeRange === '1M') daysToSubtract = 30;
  if (opts.timeRange === '3M') daysToSubtract = 90;
  if (opts.timeRange === '6M') daysToSubtract = 180;
  return seasonData.slice(-daysToSubtract);
}

/** Sandbox chart: forecast days from today, or this Jul–Jun season up to today. */
export function filterSandboxScenarioDays<T extends { fullDate: string; timestamp: number }>(
  rows: T[],
  opts: { sandboxView: 'forecast' | 'historical'; todayStr: string; selectedSeason: string }
): T[] {
  if (opts.sandboxView === 'forecast') {
    return [...rows.filter((d) => d.fullDate >= opts.todayStr)].sort((a, b) => a.timestamp - b.timestamp);
  }
  const [startYearStr, endYearSuffixStr] = opts.selectedSeason.split('-');
  const startYear = parseInt(startYearStr, 10);
  const fullEndYear = 2000 + parseInt(endYearSuffixStr, 10);
  const seasonStart = new Date(`${startYear}-07-01T00:00:00Z`).getTime();
  const seasonEnd = new Date(`${fullEndYear}-06-30T23:59:59Z`).getTime();
  return [...rows.filter((d) => d.timestamp >= seasonStart && d.timestamp <= seasonEnd && d.fullDate <= opts.todayStr)].sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

export function mergeObservedAndForecast<T>(
  observed: Record<string, T>,
  forecast: Record<string, T>
): Record<string, T> {
  const fKeys = Object.keys(forecast);
  if (fKeys.length === 0) return observed;
  const observedKeys = Object.keys(observed).sort();
  const maxObserved = observedKeys.length ? observedKeys[observedKeys.length - 1] : '';
  const merged: Record<string, T> = { ...observed };
  for (const k of fKeys) {
    if (k > maxObserved && !observed[k]) merged[k] = forecast[k];
  }
  return merged;
}
