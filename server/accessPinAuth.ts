import type { Request } from 'express';
import {
  effectiveModules,
  resolveFarmEnabledModules,
  type FarmModuleId,
} from '../shared/auth/farmModules.ts';
import { getAdminAuth, getAdminDb } from './firebaseAdmin.ts';
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
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : '') ||
    req.socket.remoteAddress ||
    'unknown';
  return `${suffix}:${ip}`;
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

  let isAdmin =
    decoded.platformAdmin === true || decoded.admin === true || role === 'admin';
  if (!isAdmin) {
    const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
    if (userSnap.exists && userSnap.data()?.role === 'admin') isAdmin = true;
  }

  return { uid: decoded.uid, admin: isAdmin, farmId, role, authEpoch };
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

