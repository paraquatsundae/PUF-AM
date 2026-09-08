/**
 * Farm calendar is Australia/Perth. Cloud Functions run in us-central1 (UTC),
 * so `Date#getFullYear` / `getMonth` / `getDate` are yesterday for the first
 * eight hours of a Perth day — including the 05:00 blight aggregate.
 */

export type PerthYmd = { year: number; month: number; day: number };

export function getPerthYmd(date: Date = new Date()): PerthYmd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: num("year"), month: num("month"), day: num("day") };
}

export function toPerthISOString(date: Date = new Date()): string {
  const { year, month, day } = getPerthYmd(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Midnight *in the runtime TZ* on the Perth civil date. Safe to feed the
 * existing `getFullYear`/`getMonth`/`getDate` series walker: the Y-M-D
 * components match Perth, so weather-cache keys match the client in WA.
 */
export function perthCivilDate(date: Date = new Date()): Date {
  const { year, month, day } = getPerthYmd(date);
  return new Date(year, month - 1, day);
}

/**
 * SH walnut season start (1 June Perth) for the season that contains `now`.
 * June–December → this year's 1 June; January–May → last year's 1 June.
 */
export function blightSeasonStart(now: Date = new Date()): Date {
  const { year, month } = getPerthYmd(now);
  const startYear = month >= 6 ? year : year - 1;
  return new Date(startYear, 5, 1);
}
