/**
 * @vitest-environment jsdom
 *
 * The farm gateway's address rules — `src/lib/farmGateway.ts`.
 *
 * The security decision of this slice is enforced here rather than written in a
 * plan: the hub speaks plain HTTP, `x-puf-hub-token` is a bearer credential, and
 * an address that would carry it across the open internet in the clear is
 * **refused** rather than warned about. These tests are what stop that softening
 * into a dialog somebody can click through.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §8d
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyGatewayAddress,
  forgetFarmGateway,
  gatewayIdentityChanged,
  gatewayReachesAnywhere,
  readFarmGateway,
  sameHubBase,
  saveFarmGateway,
} from '../src/lib/farmGateway.ts';

afterEach(() => {
  localStorage.clear();
});

describe('which addresses may be a farm gateway', () => {
  it('accepts a Tailscale address over plain HTTP, because the tunnel is the encryption', () => {
    const verdict = classifyGatewayAddress('100.101.102.103:3000');
    expect(verdict.ok).toBe(true);
    expect(verdict.kind).toBe('vpn');
    expect(verdict.base).toBe('http://100.101.102.103:3000');
  });

  it('knows where CGNAT starts and stops', () => {
    // 100.64.0.0/10 is the tailnet range; 100.63.x and 100.128.x are ordinary
    // public addresses that happen to start with 100.
    expect(classifyGatewayAddress('100.64.0.1:3000').kind).toBe('vpn');
    expect(classifyGatewayAddress('100.127.255.254:3000').kind).toBe('vpn');
    expect(classifyGatewayAddress('100.63.0.1:3000').kind).toBe('public-cleartext');
    expect(classifyGatewayAddress('100.128.0.1:3000').kind).toBe('public-cleartext');
  });

  it('accepts a MagicDNS name', () => {
    const verdict = classifyGatewayAddress('shed-laptop.tailnet-1a2b.ts.net:3000');
    expect(verdict.ok).toBe(true);
    expect(verdict.kind).toBe('vpn');
  });

  it('accepts any https host, because TLS carries the token', () => {
    const verdict = classifyGatewayAddress('https://gateway.clare-downs.example');
    expect(verdict.ok).toBe(true);
    expect(verdict.kind).toBe('tls');
    expect(verdict.base).toBe('https://gateway.clare-downs.example');
  });

  it('refuses plain HTTP to a public name — the token would be in the clear', () => {
    const verdict = classifyGatewayAddress('clare-downs.duckdns.org:3000');
    expect(verdict.ok).toBe(false);
    expect(verdict.kind).toBe('public-cleartext');
    // The refusal has to name both ways out, or the operator port-forwards plain
    // HTTP and believes that is what we meant.
    expect(verdict.reason).toMatch(/VPN/i);
    expect(verdict.reason).toMatch(/https/i);
  });

  it('refuses a public IP over plain HTTP for the same reason', () => {
    expect(classifyGatewayAddress('203.0.113.9:3000').ok).toBe(false);
  });

  it('takes a Wi‑Fi address, and says it is only a Wi‑Fi address', () => {
    const verdict = classifyGatewayAddress('192.168.1.20:3000');
    expect(verdict.ok).toBe(true);
    expect(verdict.kind).toBe('lan');
    expect(gatewayReachesAnywhere(verdict.kind)).toBe(false);
    expect(verdict.reason).toMatch(/VPN address/i);
  });

  it('refuses this device', () => {
    expect(classifyGatewayAddress('127.0.0.1:3000').kind).toBe('loopback');
    expect(classifyGatewayAddress('localhost:3000').ok).toBe(false);
  });

  it('refuses something that is not an address at all', () => {
    expect(classifyGatewayAddress('  ').kind).toBe('invalid');
    expect(classifyGatewayAddress('the shed laptop').ok).toBe(false);
  });

  it('defaults the port the way the rest of the app does', () => {
    // A bare address means the workshop Express, not port 80 — same rule as
    // `normalizeHubBase`, so one hub is not two entries in the credential store.
    expect(classifyGatewayAddress('100.101.102.103').base).toBe('http://100.101.102.103:3000');
    expect(classifyGatewayAddress('http://100.101.102.103:3000/').base).toBe(
      'http://100.101.102.103:3000',
    );
  });
});

describe('what this device remembers', () => {
  it('round-trips a gateway', () => {
    saveFarmGateway({
      base: 'http://100.101.102.103:3000',
      kind: 'vpn',
      savedAt: '2026-08-10T00:00:00.000Z',
      hubId: 'a'.repeat(32),
      hubName: 'PUF-AM (shed)',
    });
    const saved = readFarmGateway();
    expect(saved?.base).toBe('http://100.101.102.103:3000');
    expect(saved?.hubName).toBe('PUF-AM (shed)');
  });

  it('re-checks the rule on the way out, not only on the way in', () => {
    // The same lesson as `pufom_last_sync_hub` (§7a): this value outlives the
    // build that wrote it, so a rule tightened later has to apply to what is
    // already on the device.
    localStorage.setItem(
      'pufam.farmGateway.v1',
      JSON.stringify({ base: 'http://clare-downs.duckdns.org:3000', kind: 'vpn', savedAt: 'x' }),
    );
    expect(readFarmGateway()).toBeNull();
  });

  it('survives a corrupt entry', () => {
    localStorage.setItem('pufam.farmGateway.v1', 'not json');
    expect(readFarmGateway()).toBeNull();
  });

  it('forgets on request', () => {
    saveFarmGateway({ base: 'http://100.64.0.5:3000', kind: 'vpn', savedAt: 'x' });
    forgetFarmGateway();
    expect(readFarmGateway()).toBeNull();
  });
});

describe('is this still the hub we paired with', () => {
  it('says nothing when either side has no identity', () => {
    // A hub too old to publish a `hubId`, or a gateway saved before the field
    // existed, must keep working rather than demand re-pairing.
    expect(gatewayIdentityChanged(undefined, 'a')).toBe(false);
    expect(gatewayIdentityChanged('a', undefined)).toBe(false);
  });

  it('spots a different machine at the same address', () => {
    expect(gatewayIdentityChanged('a'.repeat(32), 'b'.repeat(32))).toBe(true);
    expect(gatewayIdentityChanged('a'.repeat(32), 'a'.repeat(32))).toBe(false);
  });
});

describe('sameHubBase', () => {
  it('agrees about one hub spelled two ways', () => {
    expect(sameHubBase('192.168.1.20:3000', 'http://192.168.1.20:3000/')).toBe(true);
    expect(sameHubBase('http://100.64.0.5:3000', 'http://100.64.0.6:3000')).toBe(false);
    expect(sameHubBase('', 'http://100.64.0.5:3000')).toBe(false);
  });
});
