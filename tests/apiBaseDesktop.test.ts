/**
 * @vitest-environment jsdom
 *
 * The desktop route split (Plans/DESKTOP_FREENET_PLUGIN.md §6.2): Electron serves
 * the renderer from its own loopback Express, so everything is same-origin except
 * the routes that need server-only secrets.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiUrl, getApiBaseUrl, getMistFreenetApiBaseUrl, mistFreenetApiUrl, setRuntimeApiBaseUrl, usesLocalFreenetSidecar } from '../src/lib/apiBase.ts';
import type { DesktopBridge } from '../src/lib/desktopBridge.ts';

const CLOUD = 'https://am.pufworks.farm';

function installBridge(overrides: Partial<DesktopBridge> = {}): void {
  window.pufamDesktop = {
    isDesktop: true,
    cloudApiBase: CLOUD,
    freenetApiBase: '',
    mistEnabled: true,
    platform: 'linux',
    freenet: {} as DesktopBridge['freenet'],
    ...overrides,
  };
}

afterEach(() => {
  delete window.pufamDesktop;
  setRuntimeApiBaseUrl(null);
});

describe('without the desktop bridge', () => {
  it('leaves the web behaviour alone', () => {
    expect(getApiBaseUrl()).toBe('');
    expect(apiUrl('/api/auth/redeem-pin')).toBe('/api/auth/redeem-pin');
  });

  it('still honours the LAN hub picker', () => {
    setRuntimeApiBaseUrl('http://192.168.1.20:3000');
    expect(apiUrl('/api/sync/self')).toBe('http://192.168.1.20:3000/api/sync/self');
  });
});

describe('with the desktop bridge', () => {
  beforeEach(() => installBridge());

  it('keeps local routes same-origin so they hit the in-app Express', () => {
    expect(getApiBaseUrl()).toBe('');
    expect(apiUrl('/api/sync/self')).toBe('/api/sync/self');
    expect(apiUrl('/api/presence/ping')).toBe('/api/presence/ping');
    expect(apiUrl('/api/highlights/list')).toBe('/api/highlights/list');
    expect(apiUrl('/api/health')).toBe('/api/health');
  });

  it('sends the secret-bearing routes to the cloud', () => {
    // Firebase Admin and DPIRD_API_KEY never ship to an operator machine.
    expect(apiUrl('/api/auth/redeem-pin')).toBe(`${CLOUD}/api/auth/redeem-pin`);
    expect(apiUrl('/api/weather/chill-portions?x=1')).toBe(
      `${CLOUD}/api/weather/chill-portions?x=1`,
    );
  });

  it('ignores the LAN hub override — on desktop this machine is the hub', () => {
    setRuntimeApiBaseUrl('http://192.168.1.20:3000');
    expect(apiUrl('/api/sync/self')).toBe('/api/sync/self');
    expect(apiUrl('/api/auth/pins')).toBe(`${CLOUD}/api/auth/pins`);
  });

  it('serves Freenet from the in-app node, never the sidecar', () => {
    expect(getMistFreenetApiBaseUrl()).toBe('');
    expect(mistFreenetApiUrl('/api/mist/freenet/peer/status')).toBe(
      '/api/mist/freenet/peer/status',
    );
    expect(usesLocalFreenetSidecar()).toBe(false);
  });

  it('refuses a non-loopback Freenet base rather than shipping ciphertext off the machine', () => {
    // Cloud Run answers these routes with 503 anyway (MIST_FREENET_DISABLED=1),
    // so same-origin is both safer and more useful than honouring the flag.
    installBridge({ freenetApiBase: CLOUD });
    expect(getMistFreenetApiBaseUrl()).toBe('');
    expect(usesLocalFreenetSidecar()).toBe(false);
  });

  it('still allows an explicit loopback base for a workshop node on another port', () => {
    installBridge({ freenetApiBase: 'http://127.0.0.1:3100/' });
    expect(getMistFreenetApiBaseUrl()).toBe('http://127.0.0.1:3100');
    // Desktop is never "the sidecar pattern" — the shell serves these routes itself.
    expect(usesLocalFreenetSidecar()).toBe(false);
  });

  it('normalises a path given without a leading slash', () => {
    expect(apiUrl('api/auth/pins')).toBe(`${CLOUD}/api/auth/pins`);
  });

  it('falls back to same-origin when main supplied no cloud base', () => {
    installBridge({ cloudApiBase: '' });
    expect(apiUrl('/api/auth/pins')).toBe('/api/auth/pins');
  });

  it('is ignored when the object does not claim to be the desktop shell', () => {
    // Guards against a page-script forgery of window.pufamDesktop.
    installBridge({ isDesktop: false as unknown as true });
    expect(apiUrl('/api/auth/pins')).toBe('/api/auth/pins');
  });
});
