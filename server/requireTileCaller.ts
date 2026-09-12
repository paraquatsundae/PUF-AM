/**
 * Bearer gate for the Cloud Run imagery proxy — `GET /api/tiles/**`.
 *
 * Same bar as `requireWeatherCaller` (a Firebase ID token, then membership of
 * a farm, then a per-uid budget) but not the same function: the weather budget
 * is 60 / 15 min and would grey out a map on the first pan, and `verifyBearer`
 * reads `users/{uid}` on every call. A 20,000-tile pack download must not
 * become 20,000 Firestore reads.
 *
 * `verifyIdToken` is local JWT verification and runs every time. Membership
 * (claim first, stored record if the token predates it) is cached for a few
 * minutes so a farmer panning the map pays the Firestore read once, not per
 * tile. Revocation is therefore delayed by that cache window — acceptable for
 * public satellite imagery, not for weather or admin.
 */
import type { Request, Response } from 'express';

import { rateLimit } from './accessPinAuth.ts';
import { getAdminAuth, getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';
import { resolvePlatformAdminClaim } from './memberClaims.ts';

export type TileCaller = {
  uid: string;
  platformAdmin: boolean;
  farmId?: string;
};

/**
 * Sized above `MAX_PACK_TILES` (20,000) so an offline basemap download from a
 * genuine member still fits in one hour, the same reasoning as the per-IP
 * upstream ceiling in `tileProxyRoutes.ts`.
 */
export const TILE_MAX_CALLS = 25_000;
export const TILE_WINDOW_MS = 60 * 60 * 1000;

const MEMBERSHIP_CACHE_MS = 5 * 60 * 1000;
const MEMBERSHIP_CACHE_MAX = 500;

type CachedMembership = {
  member: boolean;
  until: number;
};

const membershipCache = new Map<string, CachedMembership>();

/** Reset module state between tests. */
export function resetTileCallerForTests(): void {
  membershipCache.clear();
}

function cacheGet(uid: string): CachedMembership | undefined {
  const hit = membershipCache.get(uid);
  if (!hit) return undefined;
  if (hit.until <= Date.now()) {
    membershipCache.delete(uid);
    return undefined;
  }
  return hit;
}

function cachePut(uid: string, member: boolean): void {
  if (membershipCache.size >= MEMBERSHIP_CACHE_MAX) {
    const now = Date.now();
    for (const [key, value] of membershipCache) {
      if (value.until <= now) membershipCache.delete(key);
    }
    if (membershipCache.size >= MEMBERSHIP_CACHE_MAX) {
      const oldest = membershipCache.keys().next();
      if (!oldest.done) membershipCache.delete(oldest.value);
    }
  }
  membershipCache.set(uid, { member, until: Date.now() + MEMBERSHIP_CACHE_MS });
}

function callerFromToken(decoded: {
  uid: string;
  farmId?: unknown;
  platformAdmin?: unknown;
  admin?: unknown;
  pinAuth?: unknown;
  role?: unknown;
}): TileCaller {
  const farmId = typeof decoded.farmId === 'string' ? decoded.farmId : undefined;
  return {
    uid: decoded.uid,
    platformAdmin: resolvePlatformAdminClaim(decoded),
    farmId,
  };
}

async function belongsToAFarm(caller: TileCaller): Promise<boolean> {
  if (caller.platformAdmin) return true;
  if (caller.farmId) return true;
  const snap = await getAdminDb().collection('users').doc(caller.uid).get();
  return typeof snap.data()?.farmId === 'string' && snap.data()?.farmId !== '';
}

/**
 * Gate for Cloud Run `/api/tiles/**`.
 *
 * Hub / desktop copies of this route stay open on purpose: a packaged laptop
 * has no Admin SDK, and Leaflet on the shed Wi-Fi still fetches tiles as
 * `<img src>`. The public internet is the cost surface; that is the only
 * place this runs.
 */
export async function requireTileCaller(
  req: Request,
  res: Response
): Promise<TileCaller | null> {
  if (!isAdminSdkReady()) {
    res.status(503).json({ error: 'Firebase Admin is not configured on this server.' });
    return null;
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token' });
    return null;
  }

  let caller: TileCaller;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    caller = callerFromToken(decoded);
  } catch (error) {
    res.status(401).json({
      error: error instanceof Error ? error.message : 'Not authorised',
    });
    return null;
  }

  let cached = cacheGet(caller.uid);
  if (!cached) {
    const member = await belongsToAFarm(caller);
    cachePut(caller.uid, member);
    cached = cacheGet(caller.uid);
  }
  if (!cached?.member) {
    res.status(403).json({ error: 'This account is not a member of a farm.' });
    return null;
  }

  if (!rateLimit(`tiles-uid:${caller.uid}`, TILE_MAX_CALLS, TILE_WINDOW_MS)) {
    res.status(429).json({ error: 'Too many imagery requests. Try again shortly.' });
    return null;
  }

  return caller;
}
