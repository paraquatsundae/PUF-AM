/**
 * @vitest-environment jsdom
 *
 * A tablet that changed networks kept hammering the old Wi‑Fi's DHCP address on
 * every request — the remembered hub was returned as the base even after its
 * probe failed, forever. The strike rule bounds that: a miss or two is a laptop
 * asleep and the address survives it; HUB_STRIKE_LIMIT consecutive failed
 * resolutions means the address is dead where this tablet now is, and it is
 * dropped so the operator is asked instead of every card fetching into the void.
 */

import { describe, expect, it } from 'vitest';

import { HUB_STRIKE_LIMIT, nextHubStrikes } from '../src/lib/syncHub.ts';

const OLD_WIFI = 'http://192.168.1.205:3000';
const HOTSPOT = 'http://192.168.115.230:3000';

describe('nextHubStrikes', () => {
  it('counts consecutive misses against the same address', () => {
    let strikes = nextHubStrikes(null, OLD_WIFI);
    expect(strikes).toEqual({ base: OLD_WIFI, count: 1 });
    strikes = nextHubStrikes(strikes, OLD_WIFI);
    strikes = nextHubStrikes(strikes, OLD_WIFI);
    expect(strikes.count).toBe(3);
    expect(strikes.count).toBeGreaterThanOrEqual(HUB_STRIKE_LIMIT);
  });

  it('a different remembered hub starts back at one, not at the old address debt', () => {
    const old = { base: OLD_WIFI, count: 2 };
    expect(nextHubStrikes(old, HOTSPOT)).toEqual({ base: HOTSPOT, count: 1 });
  });

  it('the limit tolerates an asleep laptop: fewer than the limit never drops', () => {
    // The drop decision is `count >= HUB_STRIKE_LIMIT`; two misses must stay under it.
    let strikes = nextHubStrikes(null, OLD_WIFI);
    strikes = nextHubStrikes(strikes, OLD_WIFI);
    expect(strikes.count).toBeLessThan(HUB_STRIKE_LIMIT);
  });
});
