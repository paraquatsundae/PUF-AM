/**
 * @vitest-environment jsdom
 *
 * Where the Firebase ID token is allowed to go.
 *
 * `apiFetch` attaches a bearer to the cloud-only families so that a weather
 * route added later is authorised without anyone remembering to. The hazard in
 * doing that centrally is the destination: `apiUrl()` sends those families to
 * `cloudApiBase`, and on a tablet that value arrives in `/api/hub/info` from
 * whatever answered the LAN scan. So the rule cannot be "anywhere except the
 * hub's own base" — a rogue responder on shed Wi-Fi would simply name itself
 * somewhere else and be handed an operator's token to replay against the real
 * farm.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({ discover: async () => ({ services: [] }) }),
}));

import type { HubInfo } from '../shared/sync/hubInfo.ts';
import { apiFetch, apiUrl, setApiIdTokenProvider, setRuntimeApiBaseUrl } from '../src/lib/apiBase.ts';
import { fetchTileBlob } from '../src/lib/basemapPack.ts';
import { saveHubCredential } from '../src/lib/hubIdentity.ts';

const HUB = 'http://192.168.1.20:3000';
const TOKEN = 'id-token-value';

function hubInfo(overrides: Partial<HubInfo> = {}): HubInfo {
  return {
    product: 'PUF-AM',
    kind: 'desktop-lan',
    name: 'PUF-AM (shed laptop)',
    pairingRequired: false,
    paired: true,
    cloudOnlyPrefixes: ['/api/auth/', '/api/weather/'],
    cloudApiBase: 'https://am.pufworks.farm',
    lanScopePrefixes: ['/api/sync/'],
    freenet: true,
    ...overrides,
  };
}

/** The `Authorization` header `apiFetch` actually put on the wire. */
async function bearerSentTo(url: string): Promise<string | null> {
  const seen: Array<Record<string, string>> = [];
  vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
    seen.push(Object.fromEntries(new Headers(init?.headers ?? {}).entries()));
    return new Response('{}', { status: 200 });
  });
  await apiFetch(url);
  return seen[0]?.authorization ?? null;
}

beforeEach(() => {
  localStorage.clear();
  setRuntimeApiBaseUrl(HUB);
  setApiIdTokenProvider(async () => TOKEN);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdTokenProvider(null);
  setRuntimeApiBaseUrl(null);
  localStorage.clear();
});

describe('the cloud bearer', () => {
  it('goes to the real cloud API', async () => {
    saveHubCredential(HUB, { info: hubInfo() });
    const url = apiUrl('/api/weather/chill-portions');
    expect(url).toBe('https://am.pufworks.farm/api/weather/chill-portions');
    expect(await bearerSentTo(url)).toBe(`Bearer ${TOKEN}`);
  });

  it('is withheld from a hub that names itself the cloud', async () => {
    // The attack: answer the LAN scan as a PUF-AM hub, defer `/api/weather/*`
    // to the cloud as a real hub does, then point that cloud somewhere owned.
    saveHubCredential(HUB, { info: hubInfo({ cloudApiBase: 'https://evil.example' }) });

    const url = apiUrl('/api/weather/chill-portions');
    expect(url).toBe('https://evil.example/api/weather/chill-portions');
    expect(await bearerSentTo(url)).toBeNull();
  });

  it('is withheld from the hub itself', async () => {
    saveHubCredential(HUB, { info: hubInfo({ cloudOnlyPrefixes: [] }) });

    const url = apiUrl('/api/weather/chill-portions');
    expect(url).toBe(`${HUB}/api/weather/chill-portions`);
    expect(await bearerSentTo(url)).toBeNull();
  });

  it('is withheld from routes that are not cloud-only', async () => {
    saveHubCredential(HUB, { info: hubInfo() });
    expect(await bearerSentTo('https://am.pufworks.farm/api/sync/peers')).toBeNull();
  });

  it('goes to Cloud Run imagery', async () => {
    saveHubCredential(HUB, { info: hubInfo() });
    const url = apiUrl('/api/tiles/12/3366/2431');
    expect(url).toBe('https://am.pufworks.farm/api/tiles/12/3366/2431');
    expect(await bearerSentTo(url)).toBe(`Bearer ${TOKEN}`);
  });

  it('is withheld from a hub that serves its own tiles', async () => {
    saveHubCredential(HUB, { info: hubInfo({ tiles: true, cloudOnlyPrefixes: [] }) });
    const url = apiUrl('/api/tiles/12/3366/2431');
    expect(url).toBe(`${HUB}/api/tiles/12/3366/2431`);
    expect(await bearerSentTo(url)).toBeNull();
  });

  it('is attached when fetchTileBlob talks to Cloud Run', async () => {
    saveHubCredential(HUB, { info: hubInfo() });
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      seen.push(Object.fromEntries(new Headers(init?.headers ?? {}).entries()));
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    });
    const blob = await fetchTileBlob(12, 3366, 2431);
    expect(blob.size).toBeGreaterThan(0);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('does not displace a bearer the caller set for itself', async () => {
    saveHubCredential(HUB, { info: hubInfo() });
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      seen.push(Object.fromEntries(new Headers(init?.headers ?? {}).entries()));
      return new Response('{}', { status: 200 });
    });

    await apiFetch(apiUrl('/api/weather/chill-portions'), {
      headers: { Authorization: 'Bearer caller-own' },
    });
    expect(seen[0]?.authorization).toBe('Bearer caller-own');
  });
});
