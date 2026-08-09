import type { Express, Request, Response } from 'express';
import { getDpirdApiKey } from './envSecrets.ts';
import { getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';
import {
  resolveWeatherStation,
  fetchDpirdHourlyTemps,
  type HourlyTempPoint,
} from '../shared/weather/dpirdClient.ts';
import {
  calculateChillData,
  getSouthernHemisphereChillWindow,
} from '../shared/weather/chillPortions.ts';

type ChillCacheDoc = {
  stationCode: string;
  stationName: string;
  seasonYear: number;
  seasonStart: string;
  seasonEnd: string;
  hourly: HourlyTempPoint[];
  totalPortions: number;
  chartData: Array<{ month: string; portions: number }>;
  hoursProcessed: number;
  hoursSkipped: number;
  updatedAt: string;
};

const MEMORY_TTL_MS = 60 * 60 * 1000;
const FIRESTORE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const memoryCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();

function docId(stationCode: string, seasonYear: number) {
  return `${stationCode}_${seasonYear}`;
}

function buildPayload(
  station: { stationCode: string; name: string },
  window: ReturnType<typeof getSouthernHemisphereChillWindow>,
  hourly: HourlyTempPoint[],
  cached: boolean
) {
  const temps = hourly.map((p) => p.temperature);
  const times = hourly.map((p) => p.time);
  const result = calculateChillData(temps, times, { enforceSeasonWindow: true });
  return {
    totalPortions: result.totalPortions,
    portionsLast24h: result.portionsLast24h,
    chartData: result.chartData,
    hoursProcessed: result.hoursProcessed,
    hoursSkipped: result.hoursSkipped,
    hourSamples: hourly.length,
    stationCode: station.stationCode,
    stationName: station.name,
    seasonYear: window.seasonYear,
    seasonLabel: window.label,
    seasonStart: window.start.toISOString(),
    seasonEnd: window.end.toISOString(),
    isCompleteSeason: window.isCompleteSeason,
    cached,
    fetchedAt: new Date().toISOString(),
  };
}

async function readFirestoreCache(
  stationCode: string,
  seasonYear: number
): Promise<ChillCacheDoc | null> {
  if (!isAdminSdkReady()) return null;
  try {
    const snap = await getAdminDb().collection('chill_cache').doc(docId(stationCode, seasonYear)).get();
    if (!snap.exists) return null;
    return snap.data() as ChillCacheDoc;
  } catch (err) {
    console.warn('[chill] Firestore read failed:', err);
    return null;
  }
}

async function writeFirestoreCache(doc: ChillCacheDoc): Promise<void> {
  if (!isAdminSdkReady()) return;
  try {
    await getAdminDb().collection('chill_cache').doc(docId(doc.stationCode, doc.seasonYear)).set(doc);
  } catch (err) {
    console.warn('[chill] Firestore write failed:', err);
  }
}

function mergeHourly(base: HourlyTempPoint[], extra: HourlyTempPoint[]): HourlyTempPoint[] {
  const map = new Map<string, number>();
  for (const p of base) map.set(p.time, p.temperature);
  for (const p of extra) map.set(p.time, p.temperature);
  return [...map.entries()]
    .map(([time, temperature]) => ({ time, temperature }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * GET /api/weather/chill-portions?lat=&lng=&stationCode=
 * Seasonal hourly DPIRD → Dynamic Model chill portions (SH Mar–Sep, Australia/Perth).
 */
export function registerChillRoutes(app: Express) {
  app.get('/api/weather/chill-portions', async (req: Request, res: Response) => {
    try {
      const apiKey = getDpirdApiKey();
      if (!apiKey) {
        return res.status(401).json({ error: 'DPIRD API key missing (set DPIRD_API_KEY in .env)' });
      }

      const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
      const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
      const stationCodeQ =
        typeof req.query.stationCode === 'string' ? req.query.stationCode.trim() : undefined;
      const stationNameQ =
        typeof req.query.stationName === 'string' ? req.query.stationName.trim() : undefined;
      const force = req.query.force === '1' || req.query.force === 'true';

      const station = resolveWeatherStation(lat, lng, stationCodeQ || undefined, stationNameQ);
      const window = getSouthernHemisphereChillWindow(new Date());
      const memKey = `v3:${station.stationCode}:${window.seasonYear}:${window.end.toISOString().slice(0, 13)}`;

      if (!force) {
        const mem = memoryCache.get(memKey);
        if (mem && mem.expiresAt > Date.now()) {
          return res.json({ ...mem.payload, cached: true });
        }
      }

      let hourly: HourlyTempPoint[] = [];
      let fromStore = false;
      const stored = force ? null : await readFirestoreCache(station.stationCode, window.seasonYear);

      if (stored?.hourly?.length) {
        const updatedAt = new Date(stored.updatedAt).getTime();
        const storeEnd = new Date(stored.seasonEnd).getTime();
        const fresh = Date.now() - updatedAt < FIRESTORE_MAX_AGE_MS;
        const coversEnough = storeEnd >= window.end.getTime() - 3 * 3600_000;

        if (fresh && coversEnough) {
          hourly = stored.hourly;
          fromStore = true;
        } else {
          // Incremental: keep prior hours, fetch only the missing tail (plus small overlap)
          const lastTime = stored.hourly[stored.hourly.length - 1]?.time;
          const resumeFrom = lastTime
            ? new Date(Math.max(window.start.getTime(), new Date(lastTime).getTime() - 6 * 3600_000))
            : window.start;
          console.log(
            `[chill] Incremental hourly ${station.stationCode} ${resumeFrom.toISOString()} → ${window.end.toISOString()}`
          );
          const tail = await fetchDpirdHourlyTemps(apiKey, station.stationCode, resumeFrom, window.end, {
            chunkDays: 4,
            concurrency: 1,
            retryOn429: true,
          });
          hourly = mergeHourly(stored.hourly, tail).filter((p) => {
            const t = new Date(p.time).getTime();
            return t >= window.start.getTime() && t <= window.end.getTime();
          });
        }
      }

      if (hourly.length === 0) {
        console.log(
          `[chill] Full hourly fetch ${station.stationCode} ${window.start.toISOString()} → ${window.end.toISOString()}`
        );
        hourly = await fetchDpirdHourlyTemps(apiKey, station.stationCode, window.start, window.end, {
          chunkDays: 4,
          concurrency: 1,
          retryOn429: true,
        });
      }

      console.log(`[chill] ${station.stationCode}: ${hourly.length} hourly samples (store=${fromStore})`);

      const payload = buildPayload(station, window, hourly, fromStore);
      memoryCache.set(memKey, { expiresAt: Date.now() + MEMORY_TTL_MS, payload });

      await writeFirestoreCache({
        stationCode: station.stationCode,
        stationName: station.name,
        seasonYear: window.seasonYear,
        seasonStart: window.start.toISOString(),
        seasonEnd: window.end.toISOString(),
        hourly,
        totalPortions: payload.totalPortions,
        chartData: payload.chartData,
        hoursProcessed: payload.hoursProcessed,
        hoursSkipped: payload.hoursSkipped,
        updatedAt: new Date().toISOString(),
      });

      return res.json(payload);
    } catch (error) {
      console.error('[chill] chill-portions failed:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to compute chill portions',
      });
    }
  });
}
