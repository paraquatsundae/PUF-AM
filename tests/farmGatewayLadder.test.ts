/**
 * @vitest-environment jsdom
 *
 * Two halves of the gateway slice that have to be right for a tablet to work off
 * the shed Wi‑Fi without ceremony:
 *
 * 1. **Which rung is tried first.** A gateway must not steal the LAN's turn — it
 *    is the same laptop reached the long way, over a VPN and somebody's upload
 *    speed, possibly on mobile data.
 * 2. **The pairing is reused, not repeated.** One laptop reachable two ways is one
 *    pairing; asking for the code again at the second address is exactly the
 *    ceremony this work exists to delete.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §8d
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { HubInfo } from '../shared/sync/hubInfo.ts';
import { HUB_TOKEN_HEADER, hubAuthHeaders, setRuntimeApiBaseUrl } from '../src/lib/apiBase.ts';
import {
  gatewayIdentityChanged,
  readFarmGateway,
  saveFarmGateway,
} from '../src/lib/farmGateway.ts';
import {
  adoptHubCredentialByHubId,
  getHubToken,
  hubNeedsPairing,
  saveHubCredential,
} from '../src/lib/hubIdentity.ts';
import { hubLadderOrder, rememberGatewayIdentity } from '../src/lib/syncHub.ts';

const SHED = 'http://192.168.1.20:3000';
const GATEWAY = 'http://100.101.102.103:3000';
const OTHER_FARM = 'http://100.64.9.9:3000';
const TOKEN = 'f'.repeat(64);
const HUB_ID = 'a'.repeat(32);

function desktopHub(overrides: Partial<HubInfo> = {}): HubInfo {
  return {
    product: 'PUF-AM',
    kind: 'desktop-lan',
    name: 'PUF-AM (cdgeo)',
    hubId: HUB_ID,
    pairingRequired: true,
    paired: true,
    cloudOnlyPrefixes: ['/api/auth/', '/api/weather/'],
    cloudApiBase: 'https://am.pufworks.farm',
    lanScopePrefixes: ['/api/sync/'],
    freenet: true,
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
  setRuntimeApiBaseUrl(null);
});

describe('the gateway selection ladder', () => {
  it('is unchanged when no gateway is saved', () => {
    // Every tablet already in a shed takes this path, so it has to be the ladder
    // that shipped: remembered hub, then discovery, then the emulator alias.
    expect(
      hubLadderOrder({
        hasExisting: true,
        existingIsGateway: false,
        hasGateway: false,
        nsdAvailable: true,
        force: false,
      }),
    ).toEqual(['existing', 'nsd', 'emulator']);
  });

  it('puts the gateway after LAN discovery', () => {
    expect(
      hubLadderOrder({
        hasExisting: false,
        existingIsGateway: false,
        hasGateway: true,
        nsdAvailable: true,
        force: false,
      }),
    ).toEqual(['nsd', 'gateway', 'emulator']);
  });

  it('demotes the gateway even when it is the address currently in use', () => {
    // The interesting case: the tablet came home over the VPN yesterday, so the
    // gateway is its remembered base. Standing in the shed this morning it must
    // find the laptop on the Wi‑Fi rather than route out to the internet and back
    // to the same machine.
    expect(
      hubLadderOrder({
        hasExisting: true,
        existingIsGateway: true,
        hasGateway: true,
        nsdAvailable: true,
        force: false,
      }),
    ).toEqual(['nsd', 'gateway', 'emulator']);
  });

  it('still reaches the gateway when there is no NSD to try', () => {
    // A hotspot or guest network that drops multicast, which is the situation the
    // gateway exists for.
    expect(
      hubLadderOrder({
        hasExisting: false,
        existingIsGateway: false,
        hasGateway: true,
        nsdAvailable: false,
        force: false,
      }),
    ).toEqual(['gateway', 'emulator']);
  });

  it('re-discovers on a forced scan rather than trusting what is set', () => {
    expect(
      hubLadderOrder({
        hasExisting: true,
        existingIsGateway: false,
        hasGateway: true,
        nsdAvailable: true,
        force: true,
      }),
    ).toEqual(['nsd', 'gateway', 'emulator']);
  });
});

describe('reusing one pairing at a second address', () => {
  it('adopts the shed pairing for the gateway address', () => {
    saveHubCredential(SHED, { token: TOKEN, info: desktopHub(), pairedAt: '2026-08-01T00:00:00Z' });
    saveHubCredential(GATEWAY, { info: desktopHub({ paired: false }) });
    expect(hubNeedsPairing(GATEWAY)).toBe(true);

    expect(adoptHubCredentialByHubId(GATEWAY, HUB_ID)).toBe(true);
    expect(getHubToken(GATEWAY)).toBe(TOKEN);
    expect(hubNeedsPairing(GATEWAY)).toBe(false);
    // The shed pairing is untouched — a tablet that moves between two sheds keeps
    // both, and that rule does not bend for a gateway.
    expect(getHubToken(SHED)).toBe(TOKEN);
  });

  it('will not hand the token to a different PUF-AM', () => {
    // Two laptops on one tailnet, or a mistyped address. The `hubId` is public and
    // so proves nothing about who is answering — but it does stop the ordinary
    // version of this mistake, and the fallback is the honest one: ask for a code.
    saveHubCredential(SHED, { token: TOKEN, info: desktopHub() });
    expect(adoptHubCredentialByHubId(OTHER_FARM, 'b'.repeat(32))).toBe(false);
    expect(getHubToken(OTHER_FARM)).toBe('');
  });

  it('adopts nothing from a hub that never published an identity', () => {
    saveHubCredential(SHED, { token: TOKEN, info: desktopHub({ hubId: undefined }) });
    expect(adoptHubCredentialByHubId(GATEWAY, undefined)).toBe(false);
    expect(adoptHubCredentialByHubId(GATEWAY, HUB_ID)).toBe(false);
  });

  it('leaves an existing pairing at the gateway alone', () => {
    // A tablet that paired over the gateway first, then later on the shed Wi‑Fi,
    // must not have its working token replaced.
    saveHubCredential(GATEWAY, { token: 'e'.repeat(64), info: desktopHub() });
    saveHubCredential(SHED, { token: TOKEN, info: desktopHub() });
    expect(adoptHubCredentialByHubId(GATEWAY, HUB_ID)).toBe(true);
    expect(getHubToken(GATEWAY)).toBe('e'.repeat(64));
  });
});

describe('re-pairing at a gateway whose machine changed', () => {
  it('takes on the new identity, so the guard does not undo the pairing', () => {
    // Without this the guard is a trap: an operator who moved the farm to a new
    // shed PC pairs with it, and the next resolve compares the new hub against the
    // old saved identity and asks for the code again.
    saveFarmGateway({
      base: GATEWAY,
      kind: 'vpn',
      savedAt: '2026-08-01T00:00:00Z',
      hubId: HUB_ID,
      hubName: 'PUF-AM (old shed PC)',
    });

    const replacement = desktopHub({ hubId: 'c'.repeat(32), name: 'PUF-AM (new shed PC)' });
    rememberGatewayIdentity(replacement);

    const saved = readFarmGateway();
    expect(saved?.hubId).toBe('c'.repeat(32));
    expect(saved?.hubName).toBe('PUF-AM (new shed PC)');
    expect(gatewayIdentityChanged(saved?.hubId, replacement.hubId)).toBe(false);
  });

  it('leaves no stale identity behind for a hub that publishes none', () => {
    saveFarmGateway({ base: GATEWAY, kind: 'vpn', savedAt: 'x', hubId: HUB_ID });
    rememberGatewayIdentity(desktopHub({ hubId: undefined }));
    expect(readFarmGateway()?.hubId).toBeUndefined();
  });
});

describe('the token over a remote base', () => {
  it('is sent to the gateway once that is the base in use', () => {
    // Nothing in `apiFetch` learns a new rule for the gateway: the token goes to
    // whichever hub base the request is aimed at, and the gateway becomes that
    // base. This is the assertion that the whole `/api/*` surface — sync shelf,
    // join-ticket resolve, `/api/mist/freenet/*` — authorises over the VPN.
    saveHubCredential(SHED, { token: TOKEN, info: desktopHub() });
    adoptHubCredentialByHubId(GATEWAY, HUB_ID);
    setRuntimeApiBaseUrl(GATEWAY);

    expect(hubAuthHeaders(`${GATEWAY}/api/sync/mist/farm-1`)).toEqual({
      [HUB_TOKEN_HEADER]: TOKEN,
    });
    expect(hubAuthHeaders(`${GATEWAY}/api/mist/freenet/slot/abc`)).toEqual({
      [HUB_TOKEN_HEADER]: TOKEN,
    });
  });

  it('is still never sent anywhere else', () => {
    saveHubCredential(SHED, { token: TOKEN, info: desktopHub() });
    adoptHubCredentialByHubId(GATEWAY, HUB_ID);
    setRuntimeApiBaseUrl(GATEWAY);

    // Including the shed address, which holds the same token: the header is
    // matched against the base actually in use, not against every hub we know.
    expect(hubAuthHeaders(`${SHED}/api/sync/self`)).toEqual({});
    expect(hubAuthHeaders('https://am.pufworks.farm/api/auth/pins')).toEqual({});
    expect(hubAuthHeaders('/api/sync/self')).toEqual({});
  });
});
