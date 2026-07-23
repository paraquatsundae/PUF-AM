/**
 * Bridge: Ji et al. 2025 daily infection risk → BlightRisk DailyData chart rows.
 * Forecast / Historical production path. Sandbox still uses legacy runBlightModel.
 */

import {
  runJiBlightModel,
  type JiOrchardParams,
  type JiRunOptions,
} from '../../shared/weather/jiBlightModel';
import type { DailyData, WeatherData } from './blightModel';

function toLocalISOString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Southern Hemisphere calendar bud break: 1 Sep of each year.
 * Primary inoculum (cumulative rain → Y) resets at each budbreak so multi-year
 * history does not saturate Y≈1 and flatten later seasons (deltaY → 0).
 */
export function isShBudbreakDay(date: Date): boolean {
  return date.getMonth() === 8 && date.getDate() === 1;
}

/** First SH budbreak on or after rangeStart (local calendar). */
export function defaultShBudbreakDate(rangeStart: Date): Date {
  const y = rangeStart.getFullYear();
  const sep1 = new Date(y, 8, 1);
  if (toLocalISOString(rangeStart) <= toLocalISOString(sep1)) return sep1;
  return new Date(y + 1, 8, 1);
}

export type RunJiBlightSeriesOptions = {
  budbreakDate?: Date;
  orchard?: JiOrchardParams;
  /**
   * Default `cumulativeY`: within each season, dose = Y_i (notebook / visible series).
   * `deltaY`: paper rain-event splash only (sparse spikes).
   */
  doseMode?: JiRunOptions['doseMode'];
};

/**
 * Run Ji infection risk from startDate→endDate.
 * Rain / primary inoculum accumulate from each SH budbreak (1 Sep), resetting yearly.
 */
export function runJiBlightSeries(
  startDate: Date,
  endDate: Date,
  weatherData: Record<string, WeatherData>,
  options: RunJiBlightSeriesOptions = {}
): DailyData[] {
  const firstBudbreak = options.budbreakDate ?? defaultShBudbreakDate(startDate);
  const firstBudbreakKey = toLocalISOString(firstBudbreak);
  // cumulativeY keeps the Historical/Forecast chart readable; deltaY alone goes flat
  // after Y saturates within a wet spring (and was broken across multi-year runs).
  const doseMode = options.doseMode ?? 'cumulativeY';

  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
  const out: DailyData[] = [];

  let lastT = 15;
  let lastRH = 60;
  let lastR = 0;
  let lastWD: number | undefined;

  /** One Ji season segment at a time (reset at each budbreak). */
  let segmentWeather: { date: string; R: number; T: number; RH: number; WD?: number }[] = [];
  let segmentMeta: { date: Date; key: string; beforeFirstBudbreak: boolean }[] = [];

  const flushSegment = () => {
    if (segmentWeather.length === 0) return;
    const ji = runJiBlightModel(segmentWeather, {
      orchard: options.orchard,
      doseMode,
    });
    for (let i = 0; i < segmentMeta.length; i++) {
      const m = segmentMeta[i];
      const row = ji[i];
      const risk = m.beforeFirstBudbreak ? 0 : row.dailyInfectionRisk;
      const raw = weatherData[m.key];
      const T = raw?.T ?? segmentWeather[i].T;
      const RH = raw?.RH ?? segmentWeather[i].RH;
      const R = raw?.R ?? 0;
      out.push({
        dateStr: m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: m.key,
        timestamp: m.date.getTime(),
        year: m.date.getFullYear(),
        month: m.date.getMonth(),
        // 6 dp — Ji daily risk is often << 0.01; 4 dp was rounding spikes to 0
        threat: Number(risk.toFixed(6)),
        latentThreat: 0,
        eruptingThreat: 0,
        daysToEruption: null,
        chem: 0,
        bio: 0,
        isSprayDay: false,
        T: Number(T.toFixed(1)),
        RH: Number(RH.toFixed(1)),
        R: Number(R.toFixed(1)),
        WD: Number(row.wetnessHours.toFixed(1)),
      });
    }
    segmentWeather = [];
    segmentMeta = [];
  };

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    const key = toLocalISOString(d);
    const w = weatherData[key];
    if (w) {
      lastT = w.T;
      lastRH = w.RH;
      lastR = w.R;
      lastWD = w.WD;
    }

    // New primary-inoculum season at each 1 Sep.
    const seasonReset = isShBudbreakDay(d) && segmentWeather.length > 0;
    if (seasonReset) {
      flushSegment();
      // Do not carry last year's rain into the new primary-inoculum season
      lastR = 0;
      lastWD = undefined;
    }

    const beforeFirstBudbreak = key < firstBudbreakKey;
    // Prefer real observations; only carry-forward within a season when a day is missing
    const R = beforeFirstBudbreak ? 0 : w ? w.R : lastR;
    const T = w ? w.T : lastT;
    const RH = w ? w.RH : lastRH;
    const WD = w ? w.WD : lastWD;

    segmentMeta.push({ date: d, key, beforeFirstBudbreak });
    segmentWeather.push({
      date: key,
      R,
      T,
      RH,
      WD,
    });
  }
  flushSegment();

  return out;
}

export {
  JI_ACTION_THRESHOLD as JI_HIGH_RISK_THRESHOLD,
  JI_ACTION_THRESHOLD,
  JI_WATCH_THRESHOLD,
} from './jiBlightBands';
