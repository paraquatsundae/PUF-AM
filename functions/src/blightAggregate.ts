import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type SprayEvent = { type: "chem" | "bio" | "both"; method: string };
type WeatherDay = { T: number; RH: number; R: number; WD: number; maxHourlyRain: number };

const DEFAULT_CALIBRATION = {
  blightSensitivity: 0.85,
  cropCoefficient: 1.0,
  gddBaseTemp: 10.0,
  humidityGradientFactor: 1.0,
  splashMultiplier: 1.0,
  chemRainWashoffRate: 0.05,
  bioColonizationEff: 1.0,
  springStartingInoculum: 0.02,
  latencyGDDThreshold: 120.0,
  secondarySpreadMultiplier: 1.0,
  chemEfficacy: 95,
  bioEfficacy: 30,
  treeHeight: 4.5,
  canopyWidth: 4.0,
  rowSpacing: 7.0,
  cdfBaseWeighting: 0.7,
  cdfExponentialEffect: 1.0,
  tempOptimumWeight: 1.2,
  wdCompoundingRate: 0.1,
  chemBaseDecayRate: 0.88,
  bioFavorableGrowthRate: 1.1,
  bioEnvDegradationCoef: 0.75,
};

function toLocalISOString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Simplified server-side blight model (mirrors client model for aggregate pre-compute). */
function runBlightModel(
  startDate: Date,
  endDate: Date,
  sprayEvents: Record<string, SprayEvent>,
  weatherData: Record<string, WeatherDay>
) {
  const data: Array<{ fullDate: string; threat: number }> = [];
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const calib = DEFAULT_CALIBRATION;

  let currentThreat = calib.springStartingInoculum;
  let currentChem = 0;
  let currentBio = 0;

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    const dateKey = toLocalISOString(currentDate);
    const w = weatherData[dateKey] || { T: 15, RH: 60, R: 0, WD: 4, maxHourlyRain: 0 };

    const tempFactor = w.T > 12 && w.T < 24 ? calib.tempOptimumWeight : 0.5;
    const wetnessFactor = w.WD > 8 ? (w.WD - 8) * calib.wdCompoundingRate : 0;
    const humidityFactor = w.RH > 85 ? 1.2 : 1.0;
    const dailyInfectionRate = tempFactor * wetnessFactor * humidityFactor * 2.0;

    const sprayEvent = sprayEvents[dateKey];
    if (sprayEvent) {
      if (sprayEvent.type === "chem" || sprayEvent.type === "both") currentChem = calib.chemEfficacy / 100;
      if (sprayEvent.type === "bio" || sprayEvent.type === "both") currentBio = Math.min(1, currentBio + 0.2);
    }

    currentChem = Math.max(0, currentChem * calib.chemBaseDecayRate);
    const totalSuppression = Math.min(1, currentChem + currentBio * (calib.bioEfficacy / 100));
    const effectiveDailyInfection = dailyInfectionRate * 0.2 * (1 - totalSuppression);

    // Match client historical/forecast: no GDD latency / secondary eruption (experimental sandbox only).
    currentThreat = currentThreat * 0.85 + effectiveDailyInfection;
    currentThreat = Math.min(1.5, currentThreat);

    data.push({ fullDate: dateKey, threat: Number(currentThreat.toFixed(2)) });
  }

  return data;
}

async function computeFarmBlightAggregate(farmId: string) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 14);

  const eventsSnap = await db
    .collection(`farms/${farmId}/events`)
    .where("date", ">=", toLocalISOString(startDate))
    .get();

  const sprayEvents: Record<string, SprayEvent> = {};
  for (const docSnap of eventsSnap.docs) {
    const e = docSnap.data();
    if (e.type === "spray" && e.sprayType) {
      sprayEvents[e.date] = { type: e.sprayType, method: e.applicationMethod || "ground" };
    }
  }

  const cacheSnap = await db.doc("weather_cache/MA002").get();
  const weatherData = (cacheSnap.data()?.weatherData || {}) as Record<string, WeatherDay>;

  const results = runBlightModel(startDate, endDate, sprayEvents, weatherData);
  const currentRiskScore = results.length > 0 ? results[results.length - 1].threat : 0;

  await db.doc(`farms/${farmId}/aggregates/blight_daily`).set({
    currentRiskScore,
    lastUpdated: new Date().toISOString(),
    startDate: toLocalISOString(startDate),
    endDate: toLocalISOString(endDate),
    resultsCount: results.length,
    stationCode: cacheSnap.data()?.stationCode || "MA002",
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

/** Recompute blight aggregate when diary events change. */
export const onDiaryEventWrite = onDocumentWritten("farms/{farmId}/events/{eventId}", async (event) => {
  const farmId = event.params.farmId;
  try {
    await computeFarmBlightAggregate(farmId);
  } catch (error) {
    console.error(`[onDiaryEventWrite] farm ${farmId}:`, error);
  }
});
