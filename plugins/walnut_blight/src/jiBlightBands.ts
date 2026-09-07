/**
 * Grower-facing bands and infection events for Ji daily infection risk.
 * Thresholds are workshop defaults (tunable later with WA scouting) — not % blight.
 */

import type { DailyData } from './blightModel';

export type RiskBand = 'quiet' | 'watch' | 'action';

/**
 * Bands sit on the S2→S3 flow — the fraction of host tissue newly infected in a day,
 * which is the "infection severity" Ji plots as grey bars in Figs. 5–8.
 *
 *   Watch  1% of tissue infected in a day
 *   Action 5% of tissue infected in a day
 *
 * Calibrated for frequency rather than picked off the scale: across 40 synthetic
 * Manjimup Sep–Dec seasons at k=1 these fire on ~19 and ~7.5 days respectively, and
 * 5–10 copper applications per season is the cadence Ji describes as standard
 * practice. Provisional until WA scouting data exists — and note Ji reports
 * specificity of 0.130, so expect false alarms at any threshold.
 *
 * These are dose-model dependent: they were an order of magnitude different before
 * the site cascade landed. Re-derive them if the model structure changes again.
 */

/** Below this: Quiet. At/above: Watch. */
export const JI_WATCH_THRESHOLD = 0.01;
/** At/above: Action. */
export const JI_ACTION_THRESHOLD = 0.05;

/** @deprecated prefer JI_ACTION_THRESHOLD — kept for existing imports */
export const JI_HIGH_RISK_THRESHOLD = JI_ACTION_THRESHOLD;

export const RISK_BAND_LABEL: Record<RiskBand, string> = {
  quiet: 'Quiet',
  watch: 'Watch',
  action: 'Action',
};

export function bandFromRisk(risk: number): RiskBand {
  if (risk >= JI_ACTION_THRESHOLD) return 'action';
  if (risk >= JI_WATCH_THRESHOLD) return 'watch';
  return 'quiet';
}

export function bandRank(band: RiskBand): number {
  if (band === 'action') return 2;
  if (band === 'watch') return 1;
  return 0;
}

export function worstBand(a: RiskBand, b: RiskBand): RiskBand {
  return bandRank(a) >= bandRank(b) ? a : b;
}

export type InfectionEvent = {
  startDate: string;
  endDate: string;
  startLabel: string;
  endLabel: string;
  peakDate: string;
  peakLabel: string;
  peakRisk: number;
  band: RiskBand;
  /** Sum of daily risk over the spell (relative event weight). */
  cumulativeRisk: number;
  dayCount: number;
  T: number;
  RH: number;
  R: number;
  WD: number;
};

/**
 * Contiguous spells where daily risk ≥ Watch.
 * Peak day supplies weather drivers for the event card.
 */
export function detectInfectionEvents(series: DailyData[]): InfectionEvent[] {
  const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp);
  const events: InfectionEvent[] = [];
  let i = 0;
  while (i < sorted.length) {
    if (sorted[i].threat < JI_WATCH_THRESHOLD) {
      i++;
      continue;
    }
    const start = i;
    while (i < sorted.length && sorted[i].threat >= JI_WATCH_THRESHOLD) i++;
    const spell = sorted.slice(start, i);
    let peak = spell[0];
    let cum = 0;
    for (const d of spell) {
      cum += d.threat;
      if (d.threat > peak.threat) peak = d;
    }
    events.push({
      startDate: spell[0].fullDate,
      endDate: spell[spell.length - 1].fullDate,
      startLabel: spell[0].dateStr,
      endLabel: spell[spell.length - 1].dateStr,
      peakDate: peak.fullDate,
      peakLabel: peak.dateStr,
      peakRisk: peak.threat,
      band: bandFromRisk(peak.threat),
      cumulativeRisk: cum,
      dayCount: spell.length,
      T: peak.T,
      RH: peak.RH,
      R: peak.R,
      WD: peak.WD,
    });
  }
  return events;
}

export type SevenDayOutlook = {
  /** Worst band in the next 7 days (including today if present). */
  outlookBand: RiskBand;
  actionDays: number;
  watchDays: number;
  quietDays: number;
  /** First Action day in window, if any. */
  nextAction: DailyData | null;
  /** First Watch-or-higher day if no Action. */
  nextWatch: DailyData | null;
  dayCount: number;
  /** Persistence of last known weather — not a NWP forecast. */
  isPersistence: true;
};

/** B1 — next 7 days outlook from forecast series (sorted ascending). */
export function summarizeNext7Days(forecastAscending: DailyData[]): SevenDayOutlook {
  const window = forecastAscending.slice(0, 7);
  let outlookBand: RiskBand = 'quiet';
  let actionDays = 0;
  let watchDays = 0;
  let quietDays = 0;
  let nextAction: DailyData | null = null;
  let nextWatch: DailyData | null = null;

  for (const d of window) {
    const b = bandFromRisk(d.threat);
    outlookBand = worstBand(outlookBand, b);
    if (b === 'action') {
      actionDays++;
      if (!nextAction) nextAction = d;
    } else if (b === 'watch') {
      watchDays++;
      if (!nextWatch) nextWatch = d;
    } else {
      quietDays++;
    }
  }

  return {
    outlookBand,
    actionDays,
    watchDays,
    quietDays,
    nextAction,
    nextWatch,
    dayCount: window.length,
    isPersistence: true,
  };
}

export function eventSeverityPhrase(band: RiskBand): string {
  if (band === 'action') return 'Strong primary infection pressure';
  if (band === 'watch') return 'Light primary infection pressure';
  return 'No infection event';
}

/**
 * Ji et al. 2025 incubation: symptoms appear ~15–21 days after infection.
 * The paper notes this delay is not (yet) temperature-dependent, so we model it
 * as a fixed calendar-day window.
 */
export const INCUBATION_MIN_DAYS = 15;
export const INCUBATION_MAX_DAYS = 21;

function addDaysISO(fullDate: string, days: number): string {
  const [y, m, d] = fullDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Expected symptom-onset pressure ("when to scout") from the daily infection-risk
 * series. Each day's infection risk is spread forward as a uniform lag over the
 * 15–21 day incubation window; the value on day t is the mean infection risk of
 * the days that would erupt into visible lesions around t.
 *
 * This is a symptom-timing overlay for historic review — it is NOT new infection
 * and NOT Ji's secondary-inoculum stage (which we do not model yet).
 *
 * Returns a map keyed by `fullDate`. Pass the full contiguous season series (not a
 * filtered slice) so the lag window can see infection days before the view start.
 */
export function computeSymptomOnsetSeries(
  series: DailyData[],
  minLag = INCUBATION_MIN_DAYS,
  maxLag = INCUBATION_MAX_DAYS
): Map<string, number> {
  const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp);
  const risk = sorted.map((d) => d.threat);
  const windowSize = maxLag - minLag + 1;
  const out = new Map<string, number>();
  for (let t = 0; t < sorted.length; t++) {
    let sum = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const src = t - lag;
      if (src >= 0) sum += risk[src];
    }
    out.set(sorted[t].fullDate, sum / windowSize);
  }
  return out;
}

export type SymptomWindow = {
  /** First day symptoms from this event could appear (event start + minLag). */
  startDate: string;
  /** Last day symptoms are expected (event end + maxLag). */
  endDate: string;
  /** Most-likely scouting day (peak infection + midpoint of incubation). */
  peakDate: string;
};

/** Calendar window in which an infection event's symptoms are expected to show. */
export function symptomWindowForEvent(
  event: Pick<InfectionEvent, 'startDate' | 'endDate' | 'peakDate'>,
  minLag = INCUBATION_MIN_DAYS,
  maxLag = INCUBATION_MAX_DAYS
): SymptomWindow {
  const mid = Math.round((minLag + maxLag) / 2);
  return {
    startDate: addDaysISO(event.startDate, minLag),
    endDate: addDaysISO(event.endDate, maxLag),
    peakDate: addDaysISO(event.peakDate, mid),
  };
}
