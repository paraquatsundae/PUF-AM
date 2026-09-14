/**
 * @vitest-environment jsdom
 *
 * Chill pack farm totals go through `apiUrl` / `apiFetch`.
 * They must not carry a client DPIRD key, and BYO must not fall through to PUFworks.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchFarmChillPortions } from '../plugins/chill_portions/src/chillPortions';
import { setApiIdTokenProvider, setRuntimeApiBaseUrl } from '../src/lib/apiBase';
import {
  BYO_DEFAULT_DATABASE,
  clearByoFirebase,
  persistByoFirebase,
} from '../src/lib/byoFirebaseConfig';
import {
  ByoWeatherNotConfiguredError,
  setRuntimeByoWeatherEndpoint,
} from '../src/lib/byoWeatherEndpoint';
import { chillModelConstants } from '../shared/farm/chillPortionsPackage';

const FN = 'https://australia-southeast1-my-farm-project.cloudfunctions.net/byoWeatherApi';
const TOKEN = 'chill-id-token';

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(path));
    else out.push(path);
  }
  return out;
}

function enableByo(): void {
  persistByoFirebase({
    apiKey: 'AIzaSyTestKey00000000000000000000000',
    authDomain: 'my-farm.firebaseapp.com',
    projectId: 'my-farm-project',
    appId: '1:123:web:abc',
    firestoreDatabaseId: BYO_DEFAULT_DATABASE,
  });
}

beforeEach(() => {
  localStorage.clear();
  setRuntimeByoWeatherEndpoint(null);
  setRuntimeApiBaseUrl(null);
  setApiIdTokenProvider(async () => TOKEN);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdTokenProvider(null);
  setRuntimeByoWeatherEndpoint(null);
  setRuntimeApiBaseUrl(null);
  clearByoFirebase();
  localStorage.clear();
});

describe('chill portions weather path', () => {
  it('never reads a Vite-prefixed DPIRD key from pack source', () => {
    const source = walkFiles('plugins/chill_portions').filter((file) =>
      /\.(ts|tsx|js|json)$/.test(file)
    );
    for (const file of source) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/import\.meta\.env\.VITE_DPIRD/);
      expect(text, file).not.toMatch(/process\.env\.VITE_DPIRD/);
    }
  });

  it('uses one kelvin offset for farm hourly and the daily calculator', () => {
    expect(chillModelConstants.kelvinOffset).toBe(273.0);
  });

  it('on a hosted farm, fetches relative /api/weather/chill-portions with a bearer', async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      seen.push({
        url: String(input),
        auth: new Headers(init?.headers ?? {}).get('authorization'),
      });
      return new Response(
        JSON.stringify({
          totalPortions: 12,
          portionsLast24h: 1,
          chartData: [],
          hoursProcessed: 24,
          hoursSkipped: 0,
          hourSamples: 24,
          stationCode: 'MA002',
          stationName: 'Manjimup',
          seasonYear: 2026,
          seasonLabel: '1 Mar 2026 – now',
          seasonStart: '2026-02-28T16:00:00.000Z',
          seasonEnd: '2026-09-15T00:00:00.000Z',
          isCompleteSeason: false,
          cached: true,
          fetchedAt: '2026-09-15T00:00:00.000Z',
        }),
        { status: 200 }
      );
    });

    const data = await fetchFarmChillPortions({ stationCode: 'MA002' });
    expect(data.totalPortions).toBe(12);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toContain('/api/weather/chill-portions');
    expect(seen[0]!.url).toContain('stationCode=MA002');
    expect(seen[0]!.url).not.toContain('am.pufworks.farm');
    expect(seen[0]!.auth).toBe(`Bearer ${TOKEN}`);
  });

  it('on BYO with no endpoint, fails closed and never fetches PUFworks', async () => {
    enableByo();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFarmChillPortions({ stationCode: 'MA002' })).rejects.toBeInstanceOf(
      ByoWeatherNotConfiguredError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on BYO with an endpoint, hits the owner function and not am.pufworks.farm', async () => {
    enableByo();
    setRuntimeByoWeatherEndpoint(FN);

    const seen: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ error: 'API route not found' }), { status: 404 });
    });

    await expect(fetchFarmChillPortions({ lat: -34.2, lng: 116.1 })).rejects.toThrow(
      /not on this farm's weather function yet/
    );
    expect(seen).toEqual([`${FN}/api/weather/chill-portions?lat=-34.2&lng=116.1`]);
    expect(seen[0]).not.toContain('am.pufworks.farm');
    expect(seen[0]).not.toContain('pufom-');
  });
});
