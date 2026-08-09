import { describe, expect, it } from 'vitest';

import {
  HUB_TOKEN_HEADER,
  LAN_SCOPE_PREFIXES,
  PairingThrottle,
  decideLanRequest,
  findDeviceByToken,
  hashDeviceToken,
  mintDeviceToken,
  mintPairingCode,
  normalizePairingCode,
  pairingCodesMatch,
  presentedHubToken,
  sanitizeDeviceName,
  type LanHubDevice,
} from '../desktop/lanHubAuth.ts';

function device(token: string, overrides: Partial<LanHubDevice> = {}): LanHubDevice {
  return {
    id: 'dev-1',
    name: 'Shed tablet',
    tokenHash: hashDeviceToken(token),
    pairedAt: '2026-08-07T00:00:00.000Z',
    ...overrides,
  };
}

function request(path: string, token?: string, method = 'GET') {
  return {
    method,
    path,
    headers: token ? { [HUB_TOKEN_HEADER]: token } : {},
  };
}

describe('pairing codes', () => {
  it('mints a readable XXXX-XXXX code with no ambiguous letters', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = mintPairingCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      // I, L, O and U are the ones an operator reads back wrong.
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('accepts what an operator actually types', () => {
    expect(normalizePairingCode('k7m2-9q4x')).toBe('K7M2-9Q4X');
    expect(normalizePairingCode('k7m29q4x')).toBe('K7M2-9Q4X');
    expect(normalizePairingCode(' K7M2 9Q4X ')).toBe('K7M2-9Q4X');
  });

  it('folds the four characters the alphabet leaves out onto their look-alikes', () => {
    // A code containing 1 and 0 is legal; a human writing it as I and O must still pair.
    expect(normalizePairingCode('IO23-45L7')).toBe('1023-4517');
    expect(normalizePairingCode('UUUU-1234')).toBe('VVVV-1234');
  });

  it('rejects anything that is not eight code characters', () => {
    expect(normalizePairingCode('')).toBe('');
    expect(normalizePairingCode('K7M2-9Q4')).toBe('');
    expect(normalizePairingCode('K7M2-9Q4XX')).toBe('');
    expect(normalizePairingCode(null)).toBe('');
    expect(normalizePairingCode(undefined)).toBe('');
  });

  it('matches case- and dash-insensitively but never matches an empty code', () => {
    expect(pairingCodesMatch('K7M2-9Q4X', 'k7m29q4x')).toBe(true);
    expect(pairingCodesMatch('K7M2-9Q4X', 'K7M2-9Q4Y')).toBe(false);
    // A hub with no code must not accept an empty submission as agreement.
    expect(pairingCodesMatch('', '')).toBe(false);
    expect(pairingCodesMatch('', 'K7M2-9Q4X')).toBe(false);
  });
});

describe('device tokens', () => {
  it('mints 256 bits and only ever stores the hash', () => {
    const token = mintDeviceToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const hash = hashDeviceToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
  });

  it('recognises a paired device and rejects everything else', () => {
    const token = mintDeviceToken();
    const devices = [device(token)];
    expect(findDeviceByToken(devices, token)?.id).toBe('dev-1');
    expect(findDeviceByToken(devices, mintDeviceToken())).toBeNull();
    expect(findDeviceByToken(devices, '')).toBeNull();
    expect(findDeviceByToken([], token)).toBeNull();
  });

  it('survives a stored hash that is not a hash', () => {
    const token = mintDeviceToken();
    const devices = [device(token, { tokenHash: 'not-hex' }), device(token, { id: 'dev-2' })];
    expect(findDeviceByToken(devices, token)?.id).toBe('dev-2');
  });

  it('reads the token from its own header or a bearer', () => {
    expect(presentedHubToken({ [HUB_TOKEN_HEADER]: ' abc ' })).toBe('abc');
    expect(presentedHubToken({ authorization: 'Bearer abc' })).toBe('abc');
    // A farm bearer in `Authorization` is a different shape, so it simply fails to match.
    expect(presentedHubToken({})).toBe('');
  });

  it('bounds an untrusted device name', () => {
    expect(sanitizeDeviceName('  Shed tablet  ')).toBe('Shed tablet');
    expect(sanitizeDeviceName('')).toBe('Tablet');
    expect(sanitizeDeviceName('a\nb')).toBe('a b');
    expect(sanitizeDeviceName('x'.repeat(200))).toHaveLength(48);
  });
});

describe('LAN request scope', () => {
  const token = mintDeviceToken();
  const devices = [device(token)];

  it('lets an unpaired device probe liveness and read the handshake', () => {
    expect(decideLanRequest(request('/api/health'), devices).kind).toBe('allow');
    expect(decideLanRequest(request('/api/hub/info'), devices).kind).toBe('allow');
    expect(decideLanRequest(request('/api/hub/pair', undefined, 'POST'), devices).kind).toBe(
      'allow',
    );
  });

  it('requires a device token on every route a tablet actually uses', () => {
    for (const prefix of LAN_SCOPE_PREFIXES) {
      const path = `${prefix}anything`;
      expect(decideLanRequest(request(path), devices).kind).toBe('unpaired');
      expect(decideLanRequest(request(path, token), devices).kind).toBe('allow');
    }
  });

  it('names the paired device so the hub can record that it was seen', () => {
    const verdict = decideLanRequest(request('/api/sync/self', token), devices);
    expect(verdict.kind).toBe('allow');
    expect(verdict.kind === 'allow' && verdict.device?.id).toBe('dev-1');
  });

  it('refuses cloud-only families outright rather than 401-ing them', () => {
    // A token would not help: a packaged desktop has no Firebase service account
    // or DPIRD key, so "pair harder" would be the wrong instruction.
    for (const path of ['/api/auth/redeem-pin', '/api/weather/dpird/stations']) {
      expect(decideLanRequest(request(path, token), devices).kind).toBe('out-of-scope');
    }
  });

  it('refuses a route nobody has scoped yet, even to a paired device', () => {
    expect(decideLanRequest(request('/api/something-new', token), devices).kind).toBe(
      'out-of-scope',
    );
  });

  it('does not serve non-API paths, so the UI is not published to the LAN', () => {
    expect(decideLanRequest(request('/', token), devices).kind).toBe('out-of-scope');
    expect(decideLanRequest(request('/index.html', token), devices).kind).toBe('out-of-scope');
    expect(decideLanRequest(request('/assets/index.js', token), devices).kind).toBe(
      'out-of-scope',
    );
  });

  it('lets a preflight through, which cannot carry the header', () => {
    expect(decideLanRequest(request('/api/sync/self', undefined, 'OPTIONS'), devices).kind).toBe(
      'allow',
    );
  });
});

describe('pairing throttle', () => {
  it('locks a client out after repeated wrong codes and lets it back in', () => {
    let now = 1_000_000;
    const throttle = new PairingThrottle(3, 60_000, () => now);

    expect(throttle.retryAfterMs('tablet')).toBe(0);
    throttle.recordFailure('tablet');
    throttle.recordFailure('tablet');
    expect(throttle.retryAfterMs('tablet')).toBe(0);

    throttle.recordFailure('tablet');
    expect(throttle.retryAfterMs('tablet')).toBe(60_000);

    now += 60_001;
    expect(throttle.retryAfterMs('tablet')).toBe(0);
  });

  it('throttles per client, so one bad tablet cannot lock out the shed', () => {
    let now = 0;
    const throttle = new PairingThrottle(1, 60_000, () => now);
    throttle.recordFailure('a');
    expect(throttle.retryAfterMs('a')).toBeGreaterThan(0);
    expect(throttle.retryAfterMs('b')).toBe(0);
  });

  it('forgets failures once a code is accepted', () => {
    const throttle = new PairingThrottle(1, 60_000, () => 0);
    throttle.recordFailure('a');
    throttle.clear('a');
    expect(throttle.retryAfterMs('a')).toBe(0);
  });
});
