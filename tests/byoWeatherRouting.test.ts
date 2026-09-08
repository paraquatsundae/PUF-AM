/**
 * @vitest-environment jsdom
 *
 * BYO farms send `/api/weather/*` to the owner's function, or nowhere.
 * They must not fall through to am.pufworks.farm / George's DPIRD key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, apiUrl, setApiIdTokenProvider, setRuntimeApiBaseUrl } from '../src/lib/apiBase';
import {
  BYO_DEFAULT_DATABASE,
  clearByoFirebase,
  persistByoFirebase,
} from '../src/lib/byoFirebaseConfig';
import {
  BYO_WEATHER_UNCONFIGURED_ORIGIN,
  ByoWeatherNotConfiguredError,
  setRuntimeByoWeatherEndpoint,
} from '../src/lib/byoWeatherEndpoint';

const FN = 'https://australia-southeast1-my-farm-project.cloudfunctions.net/byoWeatherApi';
const TOKEN = 'byo-id-token';

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

describe('BYO weather routing', () => {
  it('leaves hosted farms on the existing weather URL', () => {
    expect(apiUrl('/api/weather/ensure-cache')).toBe('/api/weather/ensure-cache');
    expect(apiUrl('/api/auth/redeem-pin')).toBe('/api/auth/redeem-pin');
  });

  it('sends weather to the owner function when the endpoint is set', () => {
    enableByo();
    setRuntimeByoWeatherEndpoint(FN);
    expect(apiUrl('/api/weather/ensure-cache')).toBe(`${FN}/api/weather/ensure-cache`);
    expect(apiUrl('/api/weather/dpird/stations?limit=500')).toBe(
      `${FN}/api/weather/dpird/stations?limit=500`
    );
    expect(apiUrl('/api/auth/redeem-pin')).toBe('/api/auth/redeem-pin');
  });

  it('does not fall through to PUFworks when the endpoint is missing', () => {
    enableByo();
    const url = apiUrl('/api/weather/ensure-cache');
    expect(url).toBe(`${BYO_WEATHER_UNCONFIGURED_ORIGIN}/api/weather/ensure-cache`);
    expect(url).not.toContain('am.pufworks.farm');
    expect(url).not.toContain('pufom-');
  });

  it('refuses to fetch weather against PUFworks or an unset endpoint', async () => {
    enableByo();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch(apiUrl('/api/weather/ensure-cache'))).rejects.toBeInstanceOf(
      ByoWeatherNotConfiguredError
    );
    await expect(apiFetch('https://am.pufworks.farm/api/weather/ensure-cache')).rejects.toBeInstanceOf(
      ByoWeatherNotConfiguredError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches the Firebase bearer to a Cloud Run-style weather URL', async () => {
    const run = 'https://byoweatherapi-abc123-ts.a.run.app';
    enableByo();
    setRuntimeByoWeatherEndpoint(run);

    const seen: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      seen.push({
        url: String(input),
        auth: new Headers(init?.headers ?? {}).get('authorization'),
      });
      return new Response('{}', { status: 200 });
    });

    await apiFetch(apiUrl('/api/weather/dpird/stations'));
    expect(seen).toEqual([
      { url: `${run}/api/weather/dpird/stations`, auth: `Bearer ${TOKEN}` },
    ]);
  });

  it('attaches the Firebase bearer to the owner function only', async () => {
    enableByo();
    setRuntimeByoWeatherEndpoint(FN);

    const seen: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      seen.push({
        url: String(input),
        auth: new Headers(init?.headers ?? {}).get('authorization'),
      });
      return new Response('{}', { status: 200 });
    });

    await apiFetch(apiUrl('/api/weather/ensure-cache'));
    expect(seen).toEqual([
      { url: `${FN}/api/weather/ensure-cache`, auth: `Bearer ${TOKEN}` },
    ]);
  });

  it('on a desktop BYO session, weather does not use the PUFworks cloud base', () => {
    enableByo();
    window.pufamDesktop = {
      isDesktop: true,
      cloudApiBase: 'https://am.pufworks.farm',
      freenetApiBase: '',
      mistEnabled: true,
      platform: 'linux',
      freenet: {} as never,
    };
    try {
      expect(apiUrl('/api/weather/ensure-cache')).toBe(
        `${BYO_WEATHER_UNCONFIGURED_ORIGIN}/api/weather/ensure-cache`
      );
      setRuntimeByoWeatherEndpoint(FN);
      expect(apiUrl('/api/weather/ensure-cache')).toBe(`${FN}/api/weather/ensure-cache`);
      expect(apiUrl('/api/auth/redeem-pin')).toBe('https://am.pufworks.farm/api/auth/redeem-pin');
    } finally {
      delete window.pufamDesktop;
    }
  });

  it('withholds the bearer from a URL that is not the cached endpoint', async () => {
    enableByo();
    setRuntimeByoWeatherEndpoint(FN);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('https://evil.example/api/weather/ensure-cache')).rejects.toBeInstanceOf(
      ByoWeatherNotConfiguredError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
