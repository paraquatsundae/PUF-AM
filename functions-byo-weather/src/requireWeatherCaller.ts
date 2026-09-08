/**
 * Bearer gate for routes that spend this project's DPIRD secret.
 *
 * Same bar as hosted `server/requireWeatherCaller.ts`: a Google sign-in is not
 * enough — the account must belong to a farm in *this* Firebase. No
 * platform-admin escape (that is a PUFworks claim).
 */
import type { Request, Response } from 'express';

import { WEATHER_MAX_CALLS, WEATHER_WINDOW_MS } from './constants';
import { getAuth, getDb } from './db';
import { membershipAllowsAccess, type StoredUser, type TokenClaims } from './membership';
import { rateLimit } from './rateLimit';

export type { StoredUser, TokenClaims };
export { membershipAllowsAccess };

export type WeatherCaller = {
  uid: string;
  farmId?: string;
};

export type WeatherCallerDeps = {
  verifyIdToken: (token: string) => Promise<TokenClaims>;
  readUser: (uid: string) => Promise<StoredUser | null>;
};

function bearerToken(req: Request): string {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export function createRequireWeatherCaller(deps: WeatherCallerDeps) {
  return async function requireWeatherCaller(
    req: Request,
    res: Response
  ): Promise<WeatherCaller | null> {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return null;
    }

    let claims: TokenClaims;
    try {
      claims = await deps.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'Not authorised' });
      return null;
    }

    let stored: StoredUser | null;
    try {
      stored = await deps.readUser(claims.uid);
    } catch {
      res.status(503).json({ error: 'Could not read farm membership.' });
      return null;
    }

    if (stored?.accessRevoked === true) {
      res.status(403).json({ error: 'Access for this account has been revoked.' });
      return null;
    }
    if (
      stored &&
      typeof stored.authEpoch === 'number' &&
      typeof claims.authEpoch === 'number' &&
      claims.authEpoch < stored.authEpoch
    ) {
      res.status(403).json({ error: 'Access for this account changed. Sign in again.' });
      return null;
    }

    if (!membershipAllowsAccess(claims, stored)) {
      res.status(403).json({ error: 'This account is not a member of a farm.' });
      return null;
    }

    if (!rateLimit(`weather:${claims.uid}`, WEATHER_MAX_CALLS, WEATHER_WINDOW_MS)) {
      res.status(429).json({ error: 'Too many weather requests. Try again shortly.' });
      return null;
    }

    const farmId = claims.farmId || stored?.farmId;
    return { uid: claims.uid, farmId };
  };
}

export function productionWeatherCallerDeps(): WeatherCallerDeps {
  return {
    async verifyIdToken(token) {
      const decoded = await getAuth().verifyIdToken(token);
      return {
        uid: decoded.uid,
        farmId: typeof decoded.farmId === 'string' ? decoded.farmId : undefined,
        authEpoch: typeof decoded.authEpoch === 'number' ? decoded.authEpoch : undefined,
      };
    },
    async readUser(uid) {
      const snap = await getDb().collection('users').doc(uid).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return {
        farmId: typeof data.farmId === 'string' ? data.farmId : undefined,
        accessRevoked: data.accessRevoked === true,
        authEpoch: typeof data.authEpoch === 'number' ? data.authEpoch : undefined,
      };
    },
  };
}
