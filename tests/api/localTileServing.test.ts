/**
 * Who actually talks to the imagery provider.
 *
 * The tile proxy was first wired so every client — web, desktop and tablet —
 * drew imagery through Cloud Run, because Leaflet fetches tiles as `<img src>`
 * and an image element cannot carry the loopback or hub token. That made one
 * server the single consumer of the provider for every install, which is the
 * opposite of what an MIT-licensed, self-hostable app wants: each operator
 * should be their own consumer, under their own terms.
 *
 * So both local guards exempt `/api/tiles/`, and a hub advertises that it serves
 * them. These tests pin the three things that have to hold together for that to
 * work, because any one of them silently sends everyone back through the cloud.
 */
import { describe, expect, it } from 'vitest';

import {
  LOOPBACK_OPEN_PREFIXES,
  isLoopbackRequestAuthorized,
} from '../../desktop/loopbackAuth.ts';
import {
  LAN_OPEN_PREFIXES,
  LAN_SCOPE_PREFIXES,
  HUB_CLOUD_ONLY_PREFIXES,
  decideLanRequest,
} from '../../desktop/lanHubAuth.ts';
import { hubServesTiles, type HubInfo } from '../../shared/sync/hubInfo.ts';

const TILE_PATH = '/api/tiles/12/3366/2431';

function hub(overrides: Partial<HubInfo> = {}): HubInfo {
  return {
    product: 'PUF-AM',
    kind: 'desktop-lan',
    name: 'PUF-AM (shed)',
    pairingRequired: true,
    paired: true,
    cloudOnlyPrefixes: [...HUB_CLOUD_ONLY_PREFIXES],
    cloudApiBase: 'https://am.pufworks.farm',
    lanScopePrefixes: [...LAN_SCOPE_PREFIXES],
    freenet: false,
    ...overrides,
  };
}

describe('the desktop serves its own tiles', () => {
  it('lets an untokened tile request through the loopback guard', () => {
    expect(
      isLoopbackRequestAuthorized('a'.repeat(64), {
        method: 'GET',
        path: TILE_PATH,
        headers: {},
      })
    ).toBe(true);
  });

  it('still guards everything else', () => {
    for (const path of ['/api/sync/lan/farm-1', '/api/mist/freenet/status', '/api/presence/f']) {
      expect(
        isLoopbackRequestAuthorized('a'.repeat(64), { method: 'GET', path, headers: {} })
      ).toBe(false);
    }
  });

  it('does not open the whole API by prefix', () => {
    // `/api/tiles` must not be spelled in a way that also matches `/api/`.
    for (const prefix of LOOPBACK_OPEN_PREFIXES) {
      expect(prefix.startsWith('/api/')).toBe(true);
      expect(prefix.length).toBeGreaterThan('/api/'.length);
    }
  });
});

describe('the LAN hub serves tiles to an unpaired tablet', () => {
  it('allows a tile request with no device token', () => {
    expect(decideLanRequest({ method: 'GET', path: TILE_PATH, headers: {} }, []).kind).toBe(
      'allow'
    );
  });

  it('keeps imagery out of the cloud-only list', () => {
    // Being in both lists would be contradictory: the hub would advertise that
    // it refuses the very route it is about to serve.
    for (const prefix of LAN_OPEN_PREFIXES) {
      expect(HUB_CLOUD_ONLY_PREFIXES).not.toContain(prefix);
    }
  });
});

describe('hubServesTiles', () => {
  it('is true only when the hub says so', () => {
    expect(hubServesTiles(hub({ tiles: true }))).toBe(true);
  });

  /**
   * The compatibility case that matters. A desktop built before the tile proxy
   * answers `/api/hub/info` without this field and cannot serve `/api/tiles/`.
   * It also cannot list the route in `cloudOnlyPrefixes`, because it has never
   * heard of it — so absence has to read as "no", or a tablet paired to an older
   * laptop asks it for tiles, collects 404s and shows a grey map.
   */
  it('treats a hub that predates the proxy as not serving tiles', () => {
    expect(hubServesTiles(hub())).toBe(false);
    expect(hubServesTiles(hub({ tiles: undefined }))).toBe(false);
  });

  it('is false when there is no hub at all', () => {
    expect(hubServesTiles(null)).toBe(false);
  });
});
