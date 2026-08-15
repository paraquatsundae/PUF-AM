/**
 * Platform-admin ops snapshot — farms, enrollment codes, invite PINs.
 *
 * Farm-role `admin` is not enough. Same claim gate as `/admin` in the app.
 */

import type { Express, Request, Response } from 'express';

import type { AccessPinRecord } from './accessPinCrypto.ts';
import { loadEnrollmentInventory } from './enrollmentCodes.ts';
import { getAdminAuth, getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';
import { resolvePlatformAdminClaim } from './memberClaims.ts';

const PINS = 'access_pins';

export type AdminOpsFarm = {
  farmId: string;
  name: string;
  ownerUid: string | null;
  createdAt: string | null;
  enabledModules: string[];
};

export type AdminOpsPin = {
  pinId: string;
  farmId: string;
  label: string;
  role: string;
  active: boolean;
  useCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string | null;
  codeHint: string | null;
  lastRedeemedAt: string | null;
  lastRedeemedDisplayName: string | null;
};

async function requirePlatformAdmin(req: Request): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    throw Object.assign(new Error('Missing Authorization bearer token'), { status: 401 });
  }
  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!resolvePlatformAdminClaim(decoded)) {
    throw Object.assign(new Error('Platform admin only'), { status: 403 });
  }
}

export function registerAdminOpsRoutes(app: Express): void {
  app.get('/api/admin/ops', async (req: Request, res: Response) => {
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({ error: 'Firebase Admin is not configured on this server.' });
      }
      await requirePlatformAdmin(req);

      const db = getAdminDb();
      const [farmsSnap, pinsSnap, enrollment] = await Promise.all([
        db.collection('farms').get(),
        db.collection(PINS).get(),
        loadEnrollmentInventory(),
      ]);

      const farms: AdminOpsFarm[] = farmsSnap.docs.map((d) => {
        const data = d.data() as {
          name?: unknown;
          ownerUid?: unknown;
          createdAt?: unknown;
          enabledModules?: unknown;
        };
        return {
          farmId: d.id,
          name: typeof data.name === 'string' ? data.name : d.id,
          ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : null,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : null,
          enabledModules: Array.isArray(data.enabledModules)
            ? data.enabledModules.filter((m): m is string => typeof m === 'string')
            : [],
        };
      });
      farms.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      const pins: AdminOpsPin[] = pinsSnap.docs.map((d) => {
        const data = d.data() as AccessPinRecord;
        return {
          pinId: d.id,
          farmId: data.farmId,
          label: (typeof data.label === 'string' && data.label.trim()) || `${data.role || 'invite'} PIN`,
          role: data.role,
          active: data.active !== false,
          useCount: data.useCount || 0,
          maxUses: data.maxUses ?? null,
          expiresAt: data.expiresAt || null,
          createdAt: data.createdAt || null,
          codeHint: data.codeHint || null,
          lastRedeemedAt: data.lastRedeemedAt || null,
          lastRedeemedDisplayName: data.lastRedeemedDisplayName || null,
        };
      });
      pins.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      return res.json({
        farms,
        pins,
        enrollment,
      });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to load ops snapshot',
      });
    }
  });
}
