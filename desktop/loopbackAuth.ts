/**
 * Per-launch bearer for the desktop shell's loopback API — plan §6.3, Phase 4 item 7.
 *
 * `127.0.0.1` keeps the API off the LAN but not away from other processes on the
 * operator's own machine: anything running as that user can reach an ephemeral
 * port, and `/api/mist/freenet/*` publishes farm ciphertext. So the port is not
 * the trust boundary — this token is.
 *
 * The token is minted in `main.ts`, handed to the Express wrapper, and injected
 * into renderer requests by the session (`webRequest.onBeforeSendHeaders`). It is
 * deliberately **not** exposed on `window.pufamDesktop`: header injection already
 * authorises every renderer fetch, so putting the secret in reachable JS would
 * only widen where it can leak from.
 *
 * Imports nothing from `electron` or `express` so it stays testable in plain Node.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Injected by main rather than `Authorization`, which `/api/sync/*` already uses for farm tokens. */
export const LOOPBACK_TOKEN_HEADER = 'x-puf-desktop-token';

/**
 * Liveness only, and it answers `{status:'ok'}` to anyone who already found the
 * port. Guarding it would break the smoke checks in `desktop/README.md` for no
 * secret gained.
 */
export const LOOPBACK_OPEN_PATHS: readonly string[] = ['/api/health'];

export type LoopbackGuardRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
};

export type LoopbackGuardResponse = {
  status(code: number): { json(body: unknown): unknown };
};

/** 256 bits from the CSPRNG, new on every launch — nothing is persisted to disk. */
export function mintLoopbackToken(): string {
  return randomBytes(32).toString('hex');
}

function headerValue(
  headers: LoopbackGuardRequest['headers'],
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

function presentedToken(req: LoopbackGuardRequest): string {
  const direct = headerValue(req.headers, LOOPBACK_TOKEN_HEADER);
  if (direct) return direct.trim();

  const auth = headerValue(req.headers, 'authorization')?.trim() ?? '';
  return /^bearer /i.test(auth) ? auth.slice(7).trim() : '';
}

function tokensMatch(expected: string, presented: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  // Length is not a secret here (it is a fixed 64 hex chars), but timingSafeEqual
  // throws on a mismatch, so the check has to come first either way.
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isLoopbackRequestAuthorized(
  expected: string,
  req: LoopbackGuardRequest,
): boolean {
  if (!req.path.startsWith('/api')) return true;
  // Same-origin means no preflight in practice, but a preflight cannot carry the
  // header, so rejecting one would fail the request that follows it.
  if (req.method === 'OPTIONS') return true;
  if (LOOPBACK_OPEN_PATHS.includes(req.path)) return true;
  return tokensMatch(expected, presentedToken(req));
}

/**
 * Express middleware. Static assets fall through untouched: the built bundle is
 * not a secret, and a browser that fetches it still gets 401 on every `/api/*`
 * call it tries to make.
 */
export function createLoopbackAuthGuard(expected: string) {
  if (!expected) throw new Error('Loopback auth guard needs a token');

  return function loopbackAuthGuard(
    req: LoopbackGuardRequest,
    res: LoopbackGuardResponse,
    next: () => void,
  ): void {
    if (isLoopbackRequestAuthorized(expected, req)) {
      next();
      return;
    }
    res.status(401).json({ error: 'PUF-AM desktop loopback token required' });
  };
}
