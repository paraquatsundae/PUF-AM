/**
 * Bearer gate for routes that spend a server-held secret rather than acting on
 * one farm's own data — the DPIRD key and the Admin SDK writes behind
 * `/api/weather/*`.
 *
 * Those routes were open because the client called them with a bare `fetch`,
 * which made the proxy a credentialed one anyone could drive. The check lives
 * here rather than inline so a weather route added later is gated by importing
 * one function, the same reasoning `apiFetch` uses for the client side.
 *
 * Answers the request itself and returns null, so callers read as:
 *
 *     const caller = await requireWeatherCaller(req, res);
 *     if (!caller) return;
 */
import type { Request, Response } from 'express';

import { rateLimit, verifyBearer } from './accessPinAuth.ts';
import { getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';

export type AuthedCaller = Awaited<ReturnType<typeof verifyBearer>>;

/**
 * One budget shared by every route in the family, keyed on the caller.
 *
 * Per-route budgets would let a caller spend each one in turn, and it is the
 * DPIRD key they all draw on, so the ceiling belongs to the key rather than to
 * any single path. Sized for a person using the app — the seasonal chill page
 * and a drying session detail are a handful of calls each — not for a client
 * refetching in a loop.
 *
 * Keyed by uid rather than IP: the caller is a known member by this point, and
 * the IP is the shared NAT of a farm office as often as it is one operator.
 */
export const WEATHER_MAX_CALLS = 60;
export const WEATHER_WINDOW_MS = 15 * 60 * 1000;

async function authenticate(req: Request, res: Response): Promise<AuthedCaller | null> {
  // A workshop tree with no service account cannot verify anyone. 503 says
  // "this server is not set up" rather than 401's "your credential is wrong".
  if (!isAdminSdkReady()) {
    res.status(503).json({ error: 'Firebase Admin is not configured on this server.' });
    return null;
  }

  try {
    return await verifyBearer(req);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    res.status(typeof status === 'number' ? status : 401).json({
      error: error instanceof Error ? error.message : 'Not authorised',
    });
    return null;
  }
}

/**
 * Membership in any farm, by the same two-step the member routes use: the
 * claim first, then the stored record for an account whose token predates it.
 *
 * Any farm, not a particular one — these routes read shared station data
 * rather than a farm's own records, so there is no farm to scope them to.
 */
async function belongsToAFarm(caller: AuthedCaller): Promise<boolean> {
  // No farm of their own, but the console needs to reach these to diagnose them.
  if (caller.platformAdmin) return true;
  if (caller.farmId) return true;
  const snap = await getAdminDb().collection('users').doc(caller.uid).get();
  return typeof snap.data()?.farmId === 'string' && snap.data()?.farmId !== '';
}

/**
 * Gate for the `/api/weather/*` family.
 *
 * A verified token alone is not enough here, which is the point. Google
 * sign-in is open to any Google account, and `verifyBearer` is content with a
 * token that carries no farm — so "authenticated" and "provisioned by this
 * farm" were quietly different things, and the DPIRD key sat behind the weaker
 * of the two. Membership is the real bar; the budget below is what remains
 * once a genuine member decides to hammer it.
 */
export async function requireWeatherCaller(
  req: Request,
  res: Response
): Promise<AuthedCaller | null> {
  const caller = await authenticate(req, res);
  if (!caller) return null;

  if (!(await belongsToAFarm(caller))) {
    res.status(403).json({ error: 'This account is not a member of a farm.' });
    return null;
  }

  if (!rateLimit(`weather:${caller.uid}`, WEATHER_MAX_CALLS, WEATHER_WINDOW_MS)) {
    res.status(429).json({ error: 'Too many weather requests. Try again shortly.' });
    return null;
  }

  return caller;
}
