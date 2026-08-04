import { describe, expect, it, vi } from 'vitest';

import {
  LOOPBACK_TOKEN_HEADER,
  createLoopbackAuthGuard,
  isLoopbackRequestAuthorized,
  mintLoopbackToken,
} from './loopbackAuth.ts';

const TOKEN = 'a'.repeat(64);

function request(
  path: string,
  headers: Record<string, string | string[] | undefined> = {},
  method = 'GET',
) {
  return { method, path, headers };
}

describe('loopback token', () => {
  it('mints 256 bits of hex, fresh every launch', () => {
    const first = mintLoopbackToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(mintLoopbackToken());
  });
});

describe('loopback API guard', () => {
  it('accepts the injected header', () => {
    expect(
      isLoopbackRequestAuthorized(
        TOKEN,
        request('/api/mist/freenet/status', { [LOOPBACK_TOKEN_HEADER]: TOKEN }),
      ),
    ).toBe(true);
  });

  it('accepts the same token as an Authorization bearer', () => {
    expect(
      isLoopbackRequestAuthorized(
        TOKEN,
        request('/api/mist/freenet/status', { authorization: `Bearer ${TOKEN}` }),
      ),
    ).toBe(true);
  });

  it('refuses another local process with no token', () => {
    expect(isLoopbackRequestAuthorized(TOKEN, request('/api/mist/freenet/publish'))).toBe(false);
  });

  it('refuses a wrong token of the same length', () => {
    expect(
      isLoopbackRequestAuthorized(
        TOKEN,
        request('/api/sync/pull', { [LOOPBACK_TOKEN_HEADER]: 'b'.repeat(64) }),
      ),
    ).toBe(false);
  });

  it('refuses a prefix of the real token', () => {
    // A length mismatch must fail closed rather than throw out of timingSafeEqual.
    expect(
      isLoopbackRequestAuthorized(
        TOKEN,
        request('/api/sync/pull', { [LOOPBACK_TOKEN_HEADER]: TOKEN.slice(0, 32) }),
      ),
    ).toBe(false);
  });

  it('leaves the static bundle open — it is not a secret', () => {
    expect(isLoopbackRequestAuthorized(TOKEN, request('/'))).toBe(true);
    expect(isLoopbackRequestAuthorized(TOKEN, request('/assets/index.js'))).toBe(true);
    expect(isLoopbackRequestAuthorized(TOKEN, request('/settings'))).toBe(true);
  });

  it('leaves /api/health open so the smoke check still works', () => {
    expect(isLoopbackRequestAuthorized(TOKEN, request('/api/health'))).toBe(true);
  });

  it('lets a preflight through — it cannot carry the header', () => {
    expect(
      isLoopbackRequestAuthorized(TOKEN, request('/api/mist/freenet/publish', {}, 'OPTIONS')),
    ).toBe(true);
  });

  it('answers 401 JSON rather than falling through to the SPA', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    createLoopbackAuthGuard(TOKEN)(request('/api/mist/freenet/publish'), { status }, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'PUF-AM desktop loopback token required' });
  });

  it('refuses to build a guard with no token', () => {
    expect(() => createLoopbackAuthGuard('')).toThrow(/token/i);
  });
});
