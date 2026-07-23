import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  runJiBlightSeries,
  bandFromRisk,
  kFromInoculumLevel,
  type OrchardInoculumLevel,
  type RiskBand,
  type SeriesWeatherDay,
} from "./jiBlightModel";
import { getDb, FIRESTORE_DATABASE_ID } from "./db";

const db = getDb();

type WeatherDay = { T: number; RH: number; R: number; WD: number; maxHourlyRain?: number };

/** Regional cache station used when a farm has no explicit station set. */
const DEFAULT_STATION_CODE = "MA002";

function toLocalISOString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * SH walnut season start (1 June) for the season that contains `today`.
 * Mirrors the client BlightRisk start (`${startYear}-06-01`); the Ji series then
 * resets primary inoculum at the 1 Sep budbreak inside this window.
 */
function seasonStartDate(today: Date): Date {
  const startYear = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(startYear, 5, 1);
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

/** Orchard inoculum level from farm model params → Ji k. Default medium (k=1). */
async function resolveInoculumLevel(farmId: string): Promise<OrchardInoculumLevel> {
  try {
    const snap = await db.doc(`farms/${farmId}/settings/model_params`).get();
    const level = snap.data()?.orchardInoculumLevel as OrchardInoculumLevel | undefined;
    if (level === "low" || level === "medium" || level === "high") return level;
  } catch {
    // fall through to default
  }
  return "medium";
}

async function computeFarmBlightAggregate(farmId: string) {
  const today = new Date();
  const startDate = seasonStartDate(today);

  const stationCode = await resolveFarmStation(farmId);
  const inoculumLevel = await resolveInoculumLevel(farmId);
  const cacheSnap = await db.doc(`weather_cache/${stationCode}`).get();
  const raw = (cacheSnap.data()?.weatherData || {}) as Record<string, WeatherDay>;

  // Ji series only needs T / RH / R / WD (WD is the shared notebook proxy in the cache).
  const weatherData: Record<string, SeriesWeatherDay> = {};
  for (const [key, w] of Object.entries(raw)) {
    weatherData[key] = { T: w.T, RH: w.RH, R: w.R, WD: w.WD };
  }

  // Same production config as client BlightRisk (Forecast/Historical): Ji 2025,
  // cumulativeY dose within each budbreak season, k from the farm's inoculum level.
  // Protection/sprays are NOT applied on the production path, so diary sprays do
  // not change this score.
  const series = runJiBlightSeries(startDate, today, weatherData, {
    orchard: { k: kFromInoculumLevel(inoculumLevel) },
    doseMode: "cumulativeY",
  });

  const todayKey = toLocalISOString(today);
  const todayRow = series.find((r) => r.fullDate === todayKey);
  const lastRow = series.length > 0 ? series[series.length - 1] : null;
  const current = todayRow ?? lastRow;

  const currentRiskScore = current ? current.threat : 0;
  const currentBand: RiskBand = current ? current.band : bandFromRisk(0);

  await db.doc(`farms/${farmId}/aggregates/blight_daily`).set({
    model: "ji-2025",
    doseMode: "cumulativeY",
    inoculumLevel,
    currentRiskScore,
    currentBand,
    riskDate: current ? current.fullDate : todayKey,
    lastUpdated: new Date().toISOString(),
    startDate: toLocalISOString(startDate),
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
 * (Production Ji risk ignores sprays; kept so a farm's aggregate is created
 * promptly on first activity and stays in step with station/settings changes.)
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
