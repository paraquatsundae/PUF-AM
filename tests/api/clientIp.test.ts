/**
 * `clientKey` used to key every rate limit on the *leftmost* `X-Forwarded-For`
 * entry, which is the one part of that header the caller writes. Rotating it
 * gave unlimited attempts at `redeem-pin`, `create-farm` and `nearby-farms`.
 *
 * So the property under test throughout is: whatever the caller puts in the
 * header, the resolved address is one a proxy we run actually observed — or
 * else the socket peer, which cannot be forged at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';

import { clientIp, socketPeerIp } from '../../server/clientIp.ts';

/** The Cloud Run sandbox sidecar: identical for every request, hence useless as a key. */
const SIDECAR = '169.254.169.126';
const CLIENT = '203.0.113.7';
/** In Fastly's published list, which is what Firebase Hosting is built on. */
const FASTLY_EDGE = '151.101.1.195';
/** A Firebase Hosting front-end address that is Google-owned, so not in that list. */
const UNKNOWN_EDGE = '199.36.158.100';
const EDGE = '34.149.151.60';

function request(opts: { peer?: string; xff?: string | string[] }): Request {
  return {
    headers: opts.xff === undefined ? {} : { 'x-forwarded-for': opts.xff },
    socket: { remoteAddress: opts.peer ?? SIDECAR },
  } as unknown as Request;
}

const ENV_KEYS = ['TRUSTED_PROXY_HOPS', 'TRUSTED_PROXY_CIDRS', 'K_SERVICE'] as const;
const saved: Record<string, string | undefined> = {};

describe('clientIp', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('with nothing in front (LAN hub, desktop, npm run dev)', () => {
    it('ignores the header entirely', () => {
      const resolved = clientIp(request({ peer: '192.168.1.20', xff: '1.2.3.4' }));
      expect(resolved).toBe('192.168.1.20');
    });

    it('reports an IPv4 peer without the dual-stack prefix', () => {
      expect(clientIp(request({ peer: '::ffff:192.168.1.20' }))).toBe('192.168.1.20');
    });

    it('says so rather than guessing when there is no peer', () => {
      expect(clientIp(request({ peer: '', xff: '1.2.3.4' }))).toBe('unknown');
    });
  });

  /**
   * Both live shapes reach the same process: `am.pufworks.farm` arrives through
   * the Firebase Hosting edge (two hops) and the `run.app` origin stays open
   * (one hop). Firebase Hosting cannot use restricted ingress, so that origin
   * cannot be closed and no single hop count is right for both — hence
   * recognising the proxy by address.
   */
  describe('on Cloud Run, recognising proxies by address', () => {
    beforeEach(() => {
      process.env.K_SERVICE = 'pufom';
    });

    describe('direct to the run.app origin (one hop)', () => {
      it('takes the address Cloud Run appended', () => {
        expect(clientIp(request({ xff: CLIENT }))).toBe(CLIENT);
      });

      it('ignores what the caller opened the list with', () => {
        expect(clientIp(request({ xff: `1.2.3.4, ${CLIENT}` }))).toBe(CLIENT);
      });

      it('is unmoved by padding meant to shift a positional read', () => {
        const padded = ['9.9.9.1', '9.9.9.2', '9.9.9.3', '9.9.9.4', CLIENT].join(', ');
        expect(clientIp(request({ xff: padded }))).toBe(CLIENT);
      });

      /**
       * The attack the hop-count version could not survive: claim the shape of
       * a Hosting request so the resolver skips a hop and lands on a forged
       * entry. The appended address is not a known edge, so nothing is skipped.
       */
      it('does not skip a hop just because the caller forged an edge address', () => {
        expect(clientIp(request({ xff: `1.2.3.4, ${FASTLY_EDGE}, ${CLIENT}` }))).toBe(CLIENT);
      });

      it('falls back to the peer when the header is absent', () => {
        expect(clientIp(request({ peer: SIDECAR }))).toBe(SIDECAR);
      });
    });

    describe('through the Firebase Hosting edge (two hops)', () => {
      it('skips the edge to the caller behind it', () => {
        expect(clientIp(request({ xff: `${CLIENT}, ${FASTLY_EDGE}` }))).toBe(CLIENT);
      });

      it('still discards what the caller prepended', () => {
        expect(clientIp(request({ xff: `1.2.3.4, ${CLIENT}, ${FASTLY_EDGE}` }))).toBe(CLIENT);
      });

      it('skips an IPv6 edge too', () => {
        expect(clientIp(request({ xff: `${CLIENT}, 2a04:4e42::1` }))).toBe(CLIENT);
      });

      /**
       * Hosting also fronts on Google-owned addresses, so the real edge may not
       * be in the published Fastly list. An unrecognised edge is used as the
       * key: everyone behind it shares a bucket, which is coarse but not
       * forgeable. `TRUSTED_PROXY_CIDRS` is how that gets corrected.
       */
      it('degrades to the edge address rather than trusting the caller', () => {
        const resolved = clientIp(request({ xff: `1.2.3.4, ${CLIENT}, ${UNKNOWN_EDGE}` }));
        expect(resolved).toBe(UNKNOWN_EDGE);
        expect(resolved).not.toBe('1.2.3.4');
      });

      it('picks the caller up once that edge is declared', () => {
        process.env.TRUSTED_PROXY_CIDRS = '199.36.158.0/24';
        expect(clientIp(request({ xff: `1.2.3.4, ${CLIENT}, ${UNKNOWN_EDGE}` }))).toBe(CLIENT);
      });

      it('falls back to the peer when the chain is nothing but proxies', () => {
        expect(clientIp(request({ peer: SIDECAR, xff: `151.101.1.1, ${FASTLY_EDGE}` }))).toBe(
          SIDECAR
        );
      });
    });
  });

  describe('explicit hop count, for the load-balancer path', () => {
    beforeEach(() => {
      process.env.K_SERVICE = 'pufom';
    });

    it('overrides address recognition when set', () => {
      process.env.TRUSTED_PROXY_HOPS = '2';
      expect(clientIp(request({ xff: `1.2.3.4, ${CLIENT}, ${EDGE}` }))).toBe(CLIENT);
    });

    it('refuses a chain shorter than configured', () => {
      process.env.TRUSTED_PROXY_HOPS = '2';
      const resolved = clientIp(request({ peer: SIDECAR, xff: '1.2.3.4' }));
      expect(resolved).toBe(SIDECAR);
      expect(resolved).not.toBe('1.2.3.4');
    });

    it('falls back to address recognition when the value is not a count', () => {
      for (const bad of ['-1', 'two', '1.5']) {
        process.env.TRUSTED_PROXY_HOPS = bad;
        expect(clientIp(request({ xff: `1.2.3.4, ${CLIENT}, ${FASTLY_EDGE}` })), bad).toBe(CLIENT);
      }
    });

    it('can switch the header off entirely', () => {
      process.env.TRUSTED_PROXY_HOPS = '0';
      expect(clientIp(request({ peer: SIDECAR, xff: CLIENT }))).toBe(SIDECAR);
    });
  });
});

/**
 * The join-ticket endpoints gate on `isPrivateHost(socketPeerIp(req))`. Had the
 * fix been `app.set('trust proxy')`, `req.ip` would have become header-derived
 * and these gates would have accepted `X-Forwarded-For: 192.168.1.50` from the
 * internet as a tablet in the shed — an authorization bypass, not just a
 * limiter bypass.
 */
describe('socketPeerIp', () => {
  it('never reads the header, whatever it claims', () => {
    const spoofed = request({ peer: '198.51.100.9', xff: '192.168.1.50' });
    expect(socketPeerIp(spoofed)).toBe('198.51.100.9');
  });

  it('reads a private peer as itself', () => {
    expect(socketPeerIp(request({ peer: '::ffff:192.168.1.50' }))).toBe('192.168.1.50');
  });

  it('is not affected by the hop count', () => {
    process.env.TRUSTED_PROXY_HOPS = '5';
    try {
      expect(socketPeerIp(request({ peer: '198.51.100.9', xff: '192.168.1.50' }))).toBe(
        '198.51.100.9'
      );
    } finally {
      delete process.env.TRUSTED_PROXY_HOPS;
    }
  });
});
