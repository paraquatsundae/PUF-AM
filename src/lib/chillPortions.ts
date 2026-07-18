/**
 * Client re-exports + fetch helper for farm chill portions.
 * Core model lives in shared/weather/chillPortions.ts (server + tests).
 */
export {
  CULTIVARS,
  calculateChillData,
  getSouthernHemisphereChillWindow,
  resolveCultivarTarget,
  type ChillCalculation,
  type ChillChartPoint,
  type ChillSeasonWindow,
  type CultivarChillTarget,
  type CultivarId,
} from '../../shared/weather/chillPortions';

import { apiUrl } from './apiBase';

export type FarmChillPortions = {
  totalPortions: number;
  chartData: Array<{ month: string; portions: number }>;
  hoursProcessed: number;
  hoursSkipped: number;
  hourSamples: number;
  stationCode: string;
  stationName: string;
  seasonYear: number;
  seasonLabel: string;
  seasonStart: string;
  seasonEnd: string;
  isCompleteSeason: boolean;
  cached: boolean;
  fetchedAt: string;
};

export async function fetchFarmChillPortions(input: {
  lat?: number;
  lng?: number;
  stationCode?: string;
}): Promise<FarmChillPortions> {
  const params = new URLSearchParams();
  if (input.lat !== undefined) params.set('lat', String(input.lat));
  if (input.lng !== undefined) params.set('lng', String(input.lng));
  if (input.stationCode) params.set('stationCode', input.stationCode);

  const res = await fetch(apiUrl(`/api/weather/chill-portions?${params.toString()}`));
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Chill API returned non-JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(String(data.error || `Failed to load chill portions (${res.status})`));
  }
  return data as unknown as FarmChillPortions;
}
