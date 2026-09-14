/**
 * @vitest-environment jsdom
 *
 * The remembered hub on a packaged APK, and why it is validated on the way out.
 *
 * `pufom_last_sync_hub` outlives the build that wrote it — `adb install -r` keeps
 * WebView storage — so a value saved by an older APK, before the address field
 * probed anything, is still there after an upgrade. `fetch()` on something that is
 * not a URL at all rejects with the same bare `TypeError` as an unplugged laptop,
 * which is how a mistyped octet turned into "Could not reach
 * http://192.168.1.1205:3000/api/mist/freenet/peer/start" on a tablet in a paddock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  // `mdnsPeers` pulls in the NSD plugin, which registers itself on import.
  registerPlugin: () => ({ discover: async () => ({ services: [] }) }),
}));

import {
  apiUrl,
  getApiBaseUrl,
  normalizeHubBase,
  setRuntimeApiBaseUrl,
} from '../src/lib/apiBase.ts';
import { tileUrl, tileUrlTemplate } from '../src/lib/basemapPack.ts';
import { forgetHubCredential, saveHubCredential } from '../src/lib/hubIdentity.ts';
import { getSelectedSyncPeerBase, setSelectedSyncPeerBase } from '../src/lib/mdnsPeers.ts';

const LAST_HUB_KEY = 'pufom_last_sync_hub';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setRuntimeApiBaseUrl(null);
});

afterEach(() => {
  setRuntimeApiBaseUrl(null);
  forgetHubCredential('http://192.168.1.20:3000');
});

describe('the remembered hub', () => {
  it('is used when it is an address', () => {
    localStorage.setItem(LAST_HUB_KEY, 'http://192.168.1.20:3000');
    expect(getApiBaseUrl()).toBe('http://192.168.1.20:3000');
  });

  it('is ignored when it is not one, rather than handed to fetch forever', () => {
    // A fourth octet typed one digit long. `new URL` refuses it, so every request
    // built from it fails before it reaches the network.
    localStorage.setItem(LAST_HUB_KEY, 'http://192.168.1.1205:3000');
    expect(getApiBaseUrl()).toBe('');
  });

  it('is repaired when it is only untidy', () => {
    localStorage.setItem(LAST_HUB_KEY, '  192.168.1.20  ');
    expect(getApiBaseUrl()).toBe('http://192.168.1.20:3000');
  });
});

describe('choosing a hub', () => {
  it('refuses to remember an address that cannot work', () => {
    setSelectedSyncPeerBase('192.168.1.1205:3000');
    expect(localStorage.getItem(LAST_HUB_KEY)).toBeNull();
    expect(getApiBaseUrl()).toBe('');
  });

  it('remembers a real one for the session and the next cold start', () => {
    setSelectedSyncPeerBase('192.168.1.20:3000');
    expect(localStorage.getItem(LAST_HUB_KEY)).toBe('http://192.168.1.20:3000');
    expect(getSelectedSyncPeerBase()).toBe('http://192.168.1.20:3000');
    expect(getApiBaseUrl()).toBe('http://192.168.1.20:3000');
  });

  it('drops the session override but keeps the remembered hub when the selection is cleared', () => {
    // Deliberate: the laptop is usually just asleep, and forgetting its address
    // would make the operator type it again for a fault that fixes itself.
    setSelectedSyncPeerBase('192.168.1.20:3000');
    setSelectedSyncPeerBase(null);
    expect(sessionStorage.getItem('pufom_sync_peer_base')).toBeNull();
    expect(getApiBaseUrl()).toBe('http://192.168.1.20:3000');
  });

  it('does not accept an unparseable runtime override', () => {
    setRuntimeApiBaseUrl('http://192.168.1.1205:3000');
    expect(getApiBaseUrl()).toBe('');
  });
});

describe('normalizeHubBase', () => {
  it('accepts what an operator would actually type', () => {
    expect(normalizeHubBase('192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
    expect(normalizeHubBase('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000');
    expect(normalizeHubBase('192.168.1.20')).toBe('http://192.168.1.20:3000');
  });

  it('rejects what would only fail later', () => {
    expect(normalizeHubBase('')).toBe('');
    expect(normalizeHubBase('192.168.1.1205:3000')).toBe('');
    expect(normalizeHubBase('not an address')).toBe('');
  });
});

describe('packaged tablet with no hub', () => {
  it('still sends weather and auth to Cloud Run so chill can calculate', () => {
    // Packaged Capacitor WebView: https://localhost serves bundled assets.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://localhost/'),
    });
    expect(getApiBaseUrl()).toBe('');
    expect(apiUrl('/api/weather/chill-portions?lat=-33')).toBe(
      'https://am.pufworks.farm/api/weather/chill-portions?lat=-33',
    );
    expect(apiUrl('/api/auth/pins')).toBe('https://am.pufworks.farm/api/auth/pins');
    // LAN-only families stay relative — there is nowhere honest to send them.
    expect(apiUrl('/api/sync/self')).toBe('/api/sync/self');
  });
});

describe('packaged tablet satellite tiles', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://localhost/'),
    });
  });

  it('uses the hosted unauthenticated tile proxy when no hub is paired', () => {
    expect(getApiBaseUrl()).toBe('');
    expect(apiUrl('/api/tiles/12/3366/2431')).toBe(
      'https://am.pufworks.farm/api/tiles/12/3366/2431',
    );
    expect(tileUrl(12, 3366, 2431)).toBe('https://am.pufworks.farm/api/tiles/12/3366/2431');
    expect(tileUrlTemplate()).toBe('https://am.pufworks.farm/api/tiles/{z}/{x}/{y}');
    expect(tileUrlTemplate().startsWith('https://am.pufworks.farm/')).toBe(true);
    expect(tileUrlTemplate()).not.toMatch(/^(\/|file:|https:\/\/localhost)/);
  });

  it('keeps tiles on the hosted proxy when a remembered LAN hub is present', () => {
    localStorage.setItem(LAST_HUB_KEY, 'http://192.168.1.20:3000');
    expect(getApiBaseUrl()).toBe('http://192.168.1.20:3000');
    expect(tileUrl(14, 1, 2)).toBe('https://am.pufworks.farm/api/tiles/14/1/2');
  });

  it('keeps tiles on the hosted proxy even when the session hub claims to serve them', () => {
    setRuntimeApiBaseUrl('http://192.168.1.20:3000');
    saveHubCredential('http://192.168.1.20:3000', {
      info: {
        product: 'PUF-AM',
        kind: 'desktop-lan',
        name: 'shed',
        pairingRequired: true,
        paired: true,
        cloudOnlyPrefixes: ['/api/auth/', '/api/weather/'],
        cloudApiBase: 'https://am.pufworks.farm',
        lanScopePrefixes: ['/api/sync/'],
        freenet: true,
        tiles: true,
      },
    });
    expect(tileUrl(12, 3366, 2431)).toBe('https://am.pufworks.farm/api/tiles/12/3366/2431');
    expect(apiUrl('/api/sync/self')).toBe('http://192.168.1.20:3000/api/sync/self');
  });
});
