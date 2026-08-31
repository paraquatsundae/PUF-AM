import type { Request } from 'express';
import {
  effectiveModules,
  resolveFarmEnabledModules,
  type FarmModuleId,
} from '../shared/auth/farmModules.ts';
import { clientIp } from './clientIp.ts';
import { getAdminAuth, getAdminDb } from './firebaseAdmin.ts';
import { resolvePlatformAdminClaim } from './memberClaims.ts';
import {
  claimsForMember,
  type ExistingClaims,
} from './memberClaims.ts';
import type { AccessPinRole } from './accessPinCrypto.ts';

export const PINS = 'access_pins';
export const FARMS_PUBLIC = 'farms_public';
export const GEO_PRECISION = 5;

/** Simple sliding-window rate limit (per process). */
const rateBuckets = new Map<string, number[]>();

export function clientKey(req: Request, suffix: string): string {
  return `${suffix}:${clientIp(req)}`;
}

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const prev = rateBuckets.get(key) || [];
  const recent = prev.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    rateBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return true;
}

export async function verifyBearer(req: Request): Promise<{
  uid: string;
  admin: boolean;
  /**
   * Platform admin, which is not the same as `admin` above — that one is true
   * for a farm's own admin too. Resolved here so the admin console can gate on
   * it without verifying the token a second time and skipping the revocation
   * check below, which is how `/api/admin/ops` came to honour revoked tokens.
   */
  platformAdmin: boolean;
  farmId?: string;
  role?: string;
  authEpoch?: number;
}> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw Object.assign(new Error('Missing Authorization bearer token'), { status: 401 });

  const decoded = await getAdminAuth().verifyIdToken(token);
  const farmId = typeof decoded.farmId === 'string' ? decoded.farmId : undefined;
  const role = typeof decoded.role === 'string' ? decoded.role : undefined;
  const authEpoch = typeof decoded.authEpoch === 'number' ? decoded.authEpoch : undefined;

  // One read, used for both revocation and the farm-admin fallback below.
  const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
  const stored = userSnap.exists ? userSnap.data() : null;

  // An ID token carries the claims it was minted with for up to an hour, so
  // `remove-member` bumping the epoch and revoking refresh tokens does not stop
  // the token already in the operator's browser. The stored record is the
  // authority on current access; the claims are only a cache of it.
  if (stored) {
    if (stored.accessRevoked === true) {
      throw Object.assign(new Error('Access for this account has been revoked.'), { status: 403 });
    }
    const storedEpoch = typeof stored.authEpoch === 'number' ? stored.authEpoch : null;
    // Compared only when the token actually carries an epoch. Platform-admin
    // sign-ins are not minted through `claimsForMember` and have none, and
    // treating "absent" as "stale" would lock the admin console out.
    if (storedEpoch !== null && typeof authEpoch === 'number' && authEpoch < storedEpoch) {
      throw Object.assign(new Error('Access for this account changed. Sign in again.'), {
        status: 401,
      });
    }
  }

  let isAdmin =
    decoded.platformAdmin === true || decoded.admin === true || role === 'admin';
  if (!isAdmin && stored?.role === 'admin') isAdmin = true;

  return {
    uid: decoded.uid,
    admin: isAdmin,
    platformAdmin: resolvePlatformAdminClaim(decoded),
    farmId,
    role,
    authEpoch,
  };
}

export async function existingClaimsFor(uid: string): Promise<ExistingClaims> {
  const user = await getAdminAuth()
    .getUser(uid)
    .catch(() => null);
  return (user?.customClaims || {}) as ExistingClaims;
}

export function farmMemberClaims(
  input: {
    farmId: string;
    role: AccessPinRole;
    modules: FarmModuleId[];
    authEpoch: number;
    pinAuth?: boolean;
    farmEnabled?: unknown;
  },
  existing?: ExistingClaims | null
) {
  const modules = effectiveModules(input.role, input.modules, input.farmEnabled);
  return claimsForMember(
    {
      farmId: input.farmId,
      role: input.role,
      modules,
      authEpoch: input.authEpoch,
      pinAuth: input.pinAuth,
    },
    existing
  );
}

export async function loadFarmEnabledModules(farmId: string): Promise<FarmModuleId[]> {
  const snap = await getAdminDb().collection('farms').doc(farmId).get();
  return resolveFarmEnabledModules(snap.data()?.enabledModules);
}

