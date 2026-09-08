import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  runJiBlightSeries,
  bandFromRisk,
  kFromInoculumLevel,
  resolveBudbreak,
  DEFAULT_SH_BUDBREAK,
  type BudbreakDay,
  type OrchardInoculumLevel,
  type RiskBand,
  type SeriesWeatherDay,
} from "./jiBlightModel";
import { getDb, FIRESTORE_DATABASE_ID } from "./db";
import { blightSeasonStart, perthCivilDate, toPerthISOString } from "./perthDate";

const db = getDb();

type WeatherDay = { T: number; RH: number; R: number; WD: number; maxHourlyRain?: number };

/** Regional cache station used when a farm has no explicit station set. */
const DEFAULT_STATION_CODE = "MA002";

/** YYYY-MM-DD on the farm calendar (Australia/Perth), not the function runtime. */
function toFarmISOString(date: Date) {
  return toPerthISOString(date);
}

async function resolveFarmStation(farmId: string): Promise<string> {
  try {
    const farmSnap = await db.doc(`farms/${farmId}`).get();
    const code = farmSnap.data()?.weatherStationCode as string | undefined;
    if (code) return code;
  } catch {
    // fall through to default
  }
  return DEFAULT_STATION_CODE;
}

/**
 * Ji production terms from the farm's model params, in one read: inoculum level → k,
 * and the budbreak date that opens the 4-week primary-inoculum window.
 * Defaults are medium (k=1) and 1 October.
 */
async function resolveJiFarmParams(
  farmId: string
): Promise<{ inoculumLevel: OrchardInoculumLevel; budbreak: BudbreakDay }> {
  try {
    const snap = await db.doc(`farms/${farmId}/settings/model_params`).get();
    const data = snap.data();
    const level = data?.orchardInoculumLevel as OrchardInoculumLevel | undefined;
    return {
      inoculumLevel: level === "low" || level === "medium" || level === "high" ? level : "medium",
      budbreak: resolveBudbreak(data?.budbreakMonth, data?.budbreakDay),
    };
  } catch {
    return { inoculumLevel: "medium", budbreak: DEFAULT_SH_BUDBREAK };
  }
}

async function computeFarmBlightAggregate(farmId: string) {
  const now = new Date();
  const today = perthCivilDate(now);
  const startDate = blightSeasonStart(now);

  const stationCode = await resolveFarmStation(farmId);
  const { inoculumLevel, budbreak } = await resolveJiFarmParams(farmId);
  const cacheSnap = await db.doc(`weather_cache/${stationCode}`).get();
  const raw = (cacheSnap.data()?.weatherData || {}) as Record<string, WeatherDay>;

  // Ji series only needs T / RH / R / WD (WD is the shared notebook proxy in the cache).
  const weatherData: Record<string, SeriesWeatherDay> = {};
  for (const [key, w] of Object.entries(raw)) {
    weatherData[key] = { T: w.T, RH: w.RH, R: w.R, WD: w.WD };
  }

  // Same production config as client BlightRisk (Forecast/Historical): Ji 2025,
  // deltaY rain-event dose within each budbreak season, k from the farm's inoculum
  // level. Protection/sprays are NOT applied on the production path, so diary sprays
  // do not change this score.
  const series = runJiBlightSeries(startDate, today, weatherData, {
    orchard: { k: kFromInoculumLevel(inoculumLevel) },
    budbreak,
  });

  const todayKey = toFarmISOString(today);
  const todayRow = series.find((r) => r.fullDate === todayKey);
  const lastRow = series.length > 0 ? series[series.length - 1] : null;
  const current = todayRow ?? lastRow;

  const currentRiskScore = current ? current.threat : 0;
  const currentBand: RiskBand = current ? current.band : bandFromRisk(0);

  await db.doc(`farms/${farmId}/aggregates/blight_daily`).set({
    model: "ji-2025",
    doseMode: "deltaY",
    inoculumLevel,
    budbreakMonth: budbreak.month,
    budbreakDay: budbreak.day,
    currentRiskScore,
    currentBand,
    riskDate: current ? current.fullDate : todayKey,
    lastUpdated: new Date().toISOString(),
    startDate: toFarmISOString(startDate),
    endDate: todayKey,
    resultsCount: series.length,
    stationCode,
  });
}

/** Nightly blight aggregate refresh for all farms (Step 12). */
export const refreshBlightAggregates = onSchedule(
  {
    schedule: "every day 05:00",
    timeZone: "Australia/Perth",
  },
  async () => {
    const farmsSnap = await db.collection("farms").get();
    for (const farmDoc of farmsSnap.docs) {
      try {
        await computeFarmBlightAggregate(farmDoc.id);
      } catch (error) {
        console.error(`[refreshBlightAggregates] farm ${farmDoc.id}:`, error);
      }
    }
  }
);

/**
 * Recompute blight aggregate when diary events change.
 * Production Ji risk ignores sprays; this still creates the aggregate on first
 * farm activity. Settings (inoculum, budbreak) are handled by onModelParamsWrite.
 */
export const onDiaryEventWrite = onDocumentWritten(
  { document: "farms/{farmId}/events/{eventId}", database: FIRESTORE_DATABASE_ID },
  async (event) => {
    const farmId = event.params.farmId;
    try {
      await computeFarmBlightAggregate(farmId);
    } catch (error) {
      console.error(`[onDiaryEventWrite] farm ${farmId}:`, error);
    }
  }
);

/**
 * Recompute when a farm admin changes Ji production terms (inoculum k, budbreak).
 * Without this the dashboard card lags the Blight Risk page until 05:00 Perth.
 */
export const onModelParamsWrite = onDocumentWritten(
  { document: "farms/{farmId}/settings/model_params", database: FIRESTORE_DATABASE_ID },
  async (event) => {
    const farmId = event.params.farmId;
    try {
      await computeFarmBlightAggregate(farmId);
    } catch (error) {
      console.error(`[onModelParamsWrite] farm ${farmId}:`, error);
    }
  }
);
