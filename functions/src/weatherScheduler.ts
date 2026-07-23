import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { estimateWetnessHoursProxy } from "./jiBlightModel";
import { fetchMetnoDailyForecast } from "./metnoForecast";
import { getDb } from "./db";

const db = getDb();
const dpirdApiKey = defineSecret("DPIRD_API_KEY");

const STATION_ANCHORS = [
  { stationCode: "MA002", name: "Manjimup", lat: -34.24, lng: 116.14 },
  { stationCode: "PE001", name: "Pemberton", lat: -34.44, lng: 116.03 },
  { stationCode: "BA001", name: "Balingup", lat: -33.78, lng: 115.98 },
  { stationCode: "DN001", name: "Donnybrook", lat: -33.58, lng: 115.82 },
];

/** Rolling window re-fetched every hour. */
const RECENT_REFRESH_DAYS = 14;
/** Keep ~2 seasons in the shared cache doc. */
const HISTORIC_KEEP_DAYS = 800;
const PAGE_LIMIT = 100;
const MAX_PAGES = 40;

type DayWeather = {
  T: number;
  RH: number;
  R: number;
  WD: number;
  maxHourlyRain: number;
  windSpeed?: number;
  ET0?: number;
};

function toLocalISOString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateWindow(days: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  return { startDate: toLocalISOString(startDate), endDate: toLocalISOString(endDate) };
}

function historicStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - HISTORIC_KEEP_DAYS);
  return toLocalISOString(d);
}

function bounds(weatherData: Record<string, DayWeather>) {
  const keys = Object.keys(weatherData).sort();
  return {
    startDate: keys[0] ?? null,
    endDate: keys[keys.length - 1] ?? null,
    dayCount: keys.length,
  };
}

function prune(weatherData: Record<string, DayWeather>) {
  const cutoff = historicStartDate();
  const next: Record<string, DayWeather> = {};
  for (const [key, value] of Object.entries(weatherData)) {
    if (key >= cutoff) next[key] = value;
  }
  return next;
}

/** Paginated DPIRD daily summaries — never trust a single limit=100 page. */
async function fetchStationWeather(
  apiKey: string,
  stationCode: string,
  startDate: string,
  endDate: string
) {
  const weatherData: Record<string, DayWeather> = {};
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://api.agric.wa.gov.au/v2/weather/stations/summaries/daily` +
      `?startDate=${startDate}&endDate=${endDate}&stationCode=${stationCode}` +
      `&limit=${PAGE_LIMIT}&offset=${offset}`;

    const response = await fetch(url, {
      headers: { "api-key": apiKey, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`DPIRD ${stationCode}: HTTP ${response.status}`);
    }

    const json = await response.json();
    const summaries = json.collection?.[0]?.summaries || [];
    if (summaries.length === 0) break;

    for (const obs of summaries) {
      if (!obs.period) continue;
      const dateKey = `${obs.period.year}-${String(obs.period.month).padStart(2, "0")}-${String(obs.period.day).padStart(2, "0")}`;
      const R = obs.rainfall ?? 0;
      const RH = obs.relativeHumidity?.avg ?? 60;
      weatherData[dateKey] = {
        T: obs.airTemperature?.avg ?? 15,
        RH,
        R,
        // Interim LWD proxy (Ji notebook) until hourly / on-farm wetness — not rain?10:0.
        // Must match estimateWetnessHoursProxy in shared/functions Ji modules.
        WD: estimateWetnessHoursProxy(R, RH),
        maxHourlyRain: R > 0 ? R * 0.2 : 0,
        windSpeed: obs.wind?.[0]?.avg?.speed ?? 10,
        ET0: obs.evapotranspiration?.shortCrop ?? 3,
      };
    }

    if (summaries.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return weatherData;
}

/**
 * Hourly DPIRD refresh:
 * - Historic series stays in weather_cache/{station}
 * - Each hour only re-fetches the recent ~14 day window and merges
 * - Empty/thin caches get a one-shot historic backfill
 */
export const refreshWeatherCache = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "Australia/Perth",
    secrets: [dpirdApiKey],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const apiKey = dpirdApiKey.value();
    if (!apiKey) {
      console.error("[refreshWeatherCache] DPIRD_API_KEY secret not configured");
      return;
    }

    const { startDate: recentStart, endDate: recentEnd } = getDateWindow(RECENT_REFRESH_DAYS);
    const histStart = historicStartDate();
    const now = new Date().toISOString();

    for (const station of STATION_ANCHORS) {
      try {
        const ref = db.doc(`weather_cache/${station.stationCode}`);
        const snap = await ref.get();
        let weatherData = {
          ...((snap.exists ? snap.data()?.weatherData : {}) as Record<string, DayWeather>),
        };
        let historicBackfilledAt = snap.exists
          ? (snap.data()?.historicBackfilledAt as string | undefined)
          : undefined;

        const existing = bounds(weatherData);
        const needsHistoric =
          existing.dayCount < 60 || !existing.startDate || existing.startDate > histStart;

        if (needsHistoric) {
          console.log(
            `[refreshWeatherCache] Historic backfill ${station.stationCode} ${histStart} → ${recentEnd}`
          );
          const historic = await fetchStationWeather(
            apiKey,
            station.stationCode,
            histStart,
            recentEnd
          );
          weatherData = { ...weatherData, ...historic };
          historicBackfilledAt = now;
        }

        const recent = await fetchStationWeather(
          apiKey,
          station.stationCode,
          recentStart,
          recentEnd
        );
        weatherData = prune({ ...weatherData, ...recent });
        const next = bounds(weatherData);

        // MET Norway forecast (future days) — separate field so observed stays clean.
        // Failure here must not block the observed refresh.
        let forecastPatch: Record<string, unknown> = {};
        try {
          const today = toLocalISOString(new Date());
          const { forecastData, fetchedAt } = await fetchMetnoDailyForecast({
            lat: station.lat,
            lng: station.lng,
          });
          // Keep only today onward — history already lives in weatherData.
          const future: Record<string, DayWeather> = {};
          for (const [key, value] of Object.entries(forecastData)) {
            if (key >= today) future[key] = value;
          }
          forecastPatch = { forecastData: future, forecastUpdatedAt: fetchedAt };
          console.log(
            `[refreshWeatherCache] ${station.stationCode}: forecast ${Object.keys(future).length} days`
          );
        } catch (fcErr) {
          console.error(`[refreshWeatherCache] MET Norway failed for ${station.stationCode}:`, fcErr);
        }

        await ref.set(
          {
            stationCode: station.stationCode,
            stationName: station.name,
            lastUpdated: now,
            startDate: next.startDate,
            endDate: next.endDate,
            weatherData,
            ...(historicBackfilledAt ? { historicBackfilledAt } : {}),
            ...forecastPatch,
          },
          { merge: true }
        );

        console.log(
          `[refreshWeatherCache] ${station.stationCode}: ${next.dayCount} days ` +
            `(${next.startDate} → ${next.endDate}), recent ${Object.keys(recent).length}`
        );
      } catch (error) {
        console.error(`[refreshWeatherCache] Failed for ${station.stationCode}:`, error);
      }
    }
  }
);
