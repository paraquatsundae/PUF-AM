/**
 * Client re-exports + fetch helper for farm chill portions.
 * Core model lives in shared/weather/chillPortions.ts (server + tests).
 *
 * Weather host is `apiUrl` / `apiFetch` — never a client DPIRD key
 * (`Plans/API_KEY_SECURITY.md`, `Plans/NAMING.md` §3, `Plans/FIREBASE_BILLING.md` §3).
 * Hosted → Cloud Run. BYO → owner function or fail closed. Never `VITE_DPIRD_API_KEY`.
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
} from '../../../shared/weather/chillPortions';

import { isByoFirebase } from '../../../src/lib/byoFirebaseConfig';
import { apiFetch, apiUrl } from '../../../src/lib/apiBase';

export type FarmChillPortions = {
  totalPortions: number;
  portionsLast24h: number;
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
  stationName?: string;
}): Promise<FarmChillPortions> {
  const params = new URLSearchParams();
  if (input.lat !== undefined) params.set('lat', String(input.lat));
  if (input.lng !== undefined) params.set('lng', String(input.lng));
  if (input.stationCode) params.set('stationCode', input.stationCode);
  if (input.stationName) params.set('stationName', input.stationName);

  const res = await apiFetch(apiUrl(`/api/weather/chill-portions?${params.toString()}`), {
    timeoutMs: 60000,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Chill API returned non-JSON (${res.status})`);
  }
  if (!res.ok) {
    if (res.status === 404 && isByoFirebase()) {
      throw new Error(
        'Seasonal DPIRD chill is not on this farm\'s weather function yet. The daily calculator still works. PUF-AM will not use the PUFworks weather API.'
      );
    }
    throw new Error(String(data.error || `Failed to load chill portions (${res.status})`));
  }
  return data as unknown as FarmChillPortions;
}
