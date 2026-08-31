/**
 * `clientIp` decides which `X-Forwarded-For` entry is the caller by asking
 * whether each one from the right belongs to a proxy we run. A false positive
 * here skips a real caller's address and hands the key to whatever they wrote;
 * a false negative only makes the rate-limit bucket coarser. So the mask
 * arithmetic and the address parsing both need to be exact, and anything
 * unparseable has to come back untrusted.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { isTrustedProxyAddress } from '../../server/trustedProxyRanges.ts';

const saved = process.env.TRUSTED_PROXY_CIDRS;

afterEach(() => {
  if (saved === undefined) delete process.env.TRUSTED_PROXY_CIDRS;
  else process.env.TRUSTED_PROXY_CIDRS = saved;
});

describe('isTrustedProxyAddress', () => {
  describe('the published Fastly ranges', () => {
    it('accepts addresses inside them', () => {
      for (const address of ['151.101.1.195', '151.101.65.195', '23.235.33.1', '199.232.0.1']) {
        expect(isTrustedProxyAddress(address), address).toBe(true);
      }
    });

    it('holds the boundaries of a /16', () => {
      expect(isTrustedProxyAddress('151.101.0.0')).toBe(true);
      expect(isTrustedProxyAddress('151.101.255.255')).toBe(true);
      expect(isTrustedProxyAddress('151.100.255.255')).toBe(false);
      expect(isTrustedProxyAddress('151.102.0.0')).toBe(false);
    });

    it('holds the boundaries of a /20', () => {
      expect(isTrustedProxyAddress('23.235.32.0')).toBe(true);
      expect(isTrustedProxyAddress('23.235.47.255')).toBe(true);
      expect(isTrustedProxyAddress('23.235.31.255')).toBe(false);
      expect(isTrustedProxyAddress('23.235.48.0')).toBe(false);
    });

    it('matches IPv6 only within the declared prefix', () => {
      expect(isTrustedProxyAddress('2a04:4e40::1')).toBe(true);
      expect(isTrustedProxyAddress('2a04:4e42:abcd::1')).toBe(true);
      expect(isTrustedProxyAddress('2a04:4e41::1')).toBe(false);
      expect(isTrustedProxyAddress('2a05:4e40::1')).toBe(false);
    });

    it('rejects ordinary client addresses', () => {
      for (const address of ['203.0.113.7', '8.8.8.8', '192.168.1.20', '199.36.158.100']) {
        expect(isTrustedProxyAddress(address), address).toBe(false);
      }
    });
  });

  describe('malformed input', () => {
    it('is untrusted rather than throwing', () => {
      const junk = ['', '   ', 'notanip', '999.1.1.1', '1.2.3', '1.2.3.4.5', '::ffff:zz', 'a::b::c'];
      for (const value of junk) {
        expect(isTrustedProxyAddress(value), JSON.stringify(value)).toBe(false);
      }
    });

    it('does not match a v4 address against a v6 range or the reverse', () => {
      process.env.TRUSTED_PROXY_CIDRS = '2001:db8::/32';
      expect(isTrustedProxyAddress('0.0.0.0')).toBe(false);
      expect(isTrustedProxyAddress('2001:db8::1')).toBe(true);
    });
  });

  describe('TRUSTED_PROXY_CIDRS', () => {
    it('adds a range without displacing the built-ins', () => {
      process.env.TRUSTED_PROXY_CIDRS = '199.36.158.0/24';
      expect(isTrustedProxyAddress('199.36.158.100')).toBe(true);
      expect(isTrustedProxyAddress('151.101.1.195')).toBe(true);
    });

    it('takes a bare address as a host route', () => {
      process.env.TRUSTED_PROXY_CIDRS = '198.51.100.9';
      expect(isTrustedProxyAddress('198.51.100.9')).toBe(true);
      expect(isTrustedProxyAddress('198.51.100.10')).toBe(false);
    });

    it('accepts several, comma-separated', () => {
      process.env.TRUSTED_PROXY_CIDRS = '10.8.0.0/16, 198.51.100.0/24';
      expect(isTrustedProxyAddress('10.8.4.4')).toBe(true);
      expect(isTrustedProxyAddress('198.51.100.9')).toBe(true);
      expect(isTrustedProxyAddress('10.9.0.1')).toBe(false);
    });

    it('drops the built-ins on "none", for a deployment with a different edge', () => {
      process.env.TRUSTED_PROXY_CIDRS = 'none, 10.8.0.0/16';
      expect(isTrustedProxyAddress('151.101.1.195')).toBe(false);
      expect(isTrustedProxyAddress('10.8.4.4')).toBe(true);
    });

    it('skips an unparseable entry without losing the rest', () => {
      process.env.TRUSTED_PROXY_CIDRS = 'garbage/99, 10.8.0.0/16';
      expect(isTrustedProxyAddress('10.8.4.4')).toBe(true);
    });

    /**
     * A typo must not widen trust. `Number('')` is 0, so a trailing slash used
     * to parse as a valid `/0` — which trusts the whole internet as a proxy,
     * makes `clientIp` fall through to the Cloud Run socket peer for every
     * request, and collapses every rate-limit bucket onto one shared key.
     */
    it('rejects a malformed prefix rather than reading it as /0', () => {
      for (const typo of ['10.8.0.0/', '10.8.0.0//24', '10.8.0.0/0x10', '10.8.0.0/ 16']) {
        process.env.TRUSTED_PROXY_CIDRS = `none, ${typo}`;
        expect(isTrustedProxyAddress('8.8.8.8')).toBe(false);
        expect(isTrustedProxyAddress('203.0.113.7')).toBe(false);
      }

      process.env.TRUSTED_PROXY_CIDRS = 'none, 2001:db8::/';
      expect(isTrustedProxyAddress('2606:4700::1')).toBe(false);
    });

    it('still takes a bare address as a host route', () => {
      process.env.TRUSTED_PROXY_CIDRS = 'none, 10.8.0.1';
      expect(isTrustedProxyAddress('10.8.0.1')).toBe(true);
      expect(isTrustedProxyAddress('10.8.0.2')).toBe(false);
    });

    /** The parsed list is cached, so a changed value has to invalidate it. */
    it('re-reads the list when the value changes', () => {
      process.env.TRUSTED_PROXY_CIDRS = '10.8.0.0/16';
      expect(isTrustedProxyAddress('10.8.4.4')).toBe(true);
      process.env.TRUSTED_PROXY_CIDRS = '10.9.0.0/16';
      expect(isTrustedProxyAddress('10.8.4.4')).toBe(false);
      expect(isTrustedProxyAddress('10.9.4.4')).toBe(true);
    });
  });
});
