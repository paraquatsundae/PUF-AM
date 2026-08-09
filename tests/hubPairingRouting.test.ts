/**
 * @vitest-environment jsdom
 *
 * The tablet half of the desktop LAN hub: once a hub has said what it is, the
 * tablet must send it the paired-device token and stop sending it the routes it
 * cannot serve.
 *
 * Both are read synchronously while a URL is being built, so both are driven from
 * the `localStorage` cache rather than a live probe — the first request of a cold
 * start has to be routed correctly, and that is before any handshake could have
 * completed.
 *
 * @see Plans/DESKTOP_FREENET_PLUGIN.md §6.4
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { HubInfo } from '../shared/sync/hubInfo.ts';
import {
  HUB_TOKEN_HEADER,
  apiUrl,
  hubAuthHeaders,
  setRuntimeApiBaseUrl,
} from '../src/lib/apiBase.ts';
import {
  forgetHubCredential,
  getHubInfo,
  getHubToken,
  hubNeedsPairing,
  saveHubCredential,
} from '../src/lib/hubIdentity.ts';

const HUB = 'http://192.168.1.20:3000';
const OTHER_HUB = 'http://192.168.1.55:3000';
const TOKEN = 'f'.repeat(64);

function desktopHub(overrides: Partial<HubInfo> = {}): HubInfo {
  return {
    product: 'PUF-AM',
    kind: 'desktop-lan',
    name: 'PUF-AM (cdgeo)',
    pairingRequired: true,
    paired: true,
    cloudOnlyPrefixes: ['/api/auth/', '/api/weather/'],
    cloudApiBase: 'https://am.pufworks.farm',
    lanScopePrefixes: ['/api/sync/'],
    freenet: true,
    ...overrides,
  };
}

function workshopHub(): HubInfo {
  return {
    product: 'PUF-AM',
    kind: 'workshop-dev',
    name: 'PUF-AM dev (cdgeo)',
    pairingRequired: false,
    paired: true,
    cloudOnlyPrefixes: [],
    cloudApiBase: '',
    lanScopePrefixes: [],
    freenet: true,
  };
}

afterEach(() => {
  localStorage.clear();
  setRuntimeApiBaseUrl(null);
});

describe('hub credential store', () => {
  it('keeps a token and a description per hub, so two sheds do not collide', () => {
    saveHubCredential(HUB, { token: TOKEN, info: desktopHub() });
    saveHubCredential(OTHER_HUB, { info: workshopHub() });

    expect(getHubToken(HUB)).toBe(TOKEN);
    expect(getHubToken(OTHER_HUB)).toBe('');
    expect(getHubInfo(HUB)?.kind).toBe('desktop-lan');
    expect(getHubInfo(OTHER_HUB)?.kind).toBe('workshop-dev');
  });

  it('treats a trailing slash and a different case as the same hub', () => {
    saveHubCredential(`${HUB}/`, { token: TOKEN });
    expect(getHubToken(HUB.toUpperCase())).toBe(TOKEN);
  });

  it('answers "needs pairing" only for a hub that asked and has no token yet', () => {
    saveHubCredential(HUB, { info: desktopHub({ paired: false }) });
    expect(hubNeedsPairing(HUB)).toBe(true);

    saveHubCredential(HUB, { token: TOKEN });
    expect(hubNeedsPairing(HUB)).toBe(false);

    saveHubCredential(OTHER_HUB, { info: workshopHub() });
    expect(hubNeedsPairing(OTHER_HUB)).toBe(false);

    // An unknown hub is "no hub", which is a different message to the operator.
    expect(hubNeedsPairing('http://192.168.1.99:3000')).toBe(false);
  });

  it('forgets a hub outright, so re-pairing starts clean', () => {
    saveHubCredential(HUB, { token: TOKEN, info: desktopHub() });
    forgetHubCredential(HUB);
    expect(getHubToken(HUB)).toBe('');
    expect(getHubInfo(HUB)).toBeNull();
  });

  it('survives a corrupt store rather than breaking every request', () => {
    localStorage.setItem('pufom_hub_creds', 'not json');
    expect(getHubToken(HUB)).toBe('');
    expect(getHubInfo(HUB)).toBeNull();
  });
});

describe('sending the token', () => {
  it('attaches it to the hub it belongs to', () => {
    setRuntimeApiBaseUrl(HUB);
    saveHubCredential(HUB, { token: TOKEN, info: desktopHub() });
    expect(hubAuthHeaders(`${HUB}/api/sync/self`)).toEqual({ [HUB_TOKEN_HEADER]: TOKEN });
  });

  it('never attaches it to anything else', () => {
    setRuntimeApiBaseUrl(HUB);
    saveHubCredential(HUB, { token: TOKEN, info: desktopHub() });

    // The cloud, another laptop, and a same-origin call all get nothing: the
    // token authorises this device to one hub and is not a general credential.
    expect(hubAuthHeaders('https://am.pufworks.farm/api/auth/pins')).toEqual({});
    expect(hubAuthHeaders(`${OTHER_HUB}/api/sync/self`)).toEqual({});
    expect(hubAuthHeaders('/api/sync/self')).toEqual({});
    expect(hubAuthHeaders('')).toEqual({});
  });

  it('sends nothing for a hub that never asked for a token', () => {
    setRuntimeApiBaseUrl(OTHER_HUB);
    saveHubCredential(OTHER_HUB, { info: workshopHub() });
    expect(hubAuthHeaders(`${OTHER_HUB}/api/sync/self`)).toEqual({});
  });
});

describe('routing around a hub that cannot serve a route', () => {
  it('sends sign-in and weather to the cloud base the hub named', () => {
    setRuntimeApiBaseUrl(HUB);
    saveHubCredential(HUB, { token: TOKEN, info: desktopHub() });

    expect(apiUrl('/api/auth/redeem-pin')).toBe('https://am.pufworks.farm/api/auth/redeem-pin');
    expect(apiUrl('/api/weather/chill-portions?x=1')).toBe(
      'https://am.pufworks.farm/api/weather/chill-portions?x=1',
    );
  });

  it('keeps the LAN families on the hub', () => {
    setRuntimeApiBaseUrl(HUB);
    saveHubCredential(HUB, { token: TOKEN, info: desktopHub() });

    expect(apiUrl('/api/sync/self')).toBe(`${HUB}/api/sync/self`);
    expect(apiUrl('/api/mist/freenet/peer/status')).toBe(`${HUB}/api/mist/freenet/peer/status`);
    expect(apiUrl('/api/health')).toBe(`${HUB}/api/health`);
  });

  it('falls back to the production host when the hub named no cloud base', () => {
    setRuntimeApiBaseUrl(HUB);
    saveHubCredential(HUB, { info: desktopHub({ cloudApiBase: '' }) });
    expect(apiUrl('/api/auth/pins')).toBe('https://am.pufworks.farm/api/auth/pins');
  });

  it('leaves a workshop hub routing everything to itself, as it always did', () => {
    setRuntimeApiBaseUrl(OTHER_HUB);
    saveHubCredential(OTHER_HUB, { info: workshopHub() });

    expect(apiUrl('/api/auth/pins')).toBe(`${OTHER_HUB}/api/auth/pins`);
    expect(apiUrl('/api/weather/chill-portions')).toBe(`${OTHER_HUB}/api/weather/chill-portions`);
    expect(apiUrl('/api/sync/self')).toBe(`${OTHER_HUB}/api/sync/self`);
  });

  it('is inert for a hub it has never described', () => {
    setRuntimeApiBaseUrl(HUB);
    expect(apiUrl('/api/auth/pins')).toBe(`${HUB}/api/auth/pins`);
  });
});
