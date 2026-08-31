/**
 * Platform-admin ops snapshot — farms, enrollment codes, invite PINs.
 *
 * Farm-role `admin` is not enough. Same claim gate as `/admin` in the app.
 */

import type { Express, Request, Response } from 'express';

import { verifyBearer } from './accessPinAuth.ts';
import type { AccessPinRecord } from './accessPinCrypto.ts';
import { clientIp, forwardedChain, socketPeerIp } from './clientIp.ts';
import { loadEnrollmentInventory } from './enrollmentCodes.ts';
import { getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';
import { isTrustedProxyAddress } from './trustedProxyRanges.ts';

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

/**
 * Through `verifyBearer` rather than `verifyIdToken` directly, so that a
 * revoked account loses the admin console at once instead of keeping it for the
 * remaining life of an ID token. These are the highest-value routes on the
 * service — every farm, every invite PIN, the whole enrollment inventory — and
 * a platform admin's token carries no `authEpoch`, so `accessRevoked` is the
 * only lever there is.
 */
async function requirePlatformAdmin(req: Request): Promise<void> {
  const caller = await verifyBearer(req);
  if (!caller.platformAdmin) {
    throw Object.assign(new Error('Platform admin only'), { status: 403 });
  }
}

export function registerAdminOpsRoutes(app: Express): void {
  /**
   * What the proxy chain actually looks like on this deployment.
   *
   * The trusted-proxy ranges in `trustedProxyRanges.ts` are a published list,
   * not an observation — Firebase Hosting fronts on Google-owned addresses as
   * well as Fastly ones, so the hop that reaches Cloud Run may not be in it.
   * When `trusted` comes back `false` for the last entry on a request made
   * through `am.pufworks.farm`, that address is the edge and belongs in
   * `TRUSTED_PROXY_CIDRS`; until then it is being used as the rate-limit key
   * and everyone behind that edge shares a bucket.
   *
   * Platform-admin gated because the chain includes the caller's own address.
   */
  app.get('/api/admin/client-ip', async (req: Request, res: Response) => {
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({ error: 'Firebase Admin is not configured on this server.' });
      }
      await requirePlatformAdmin(req);

      return res.json({
        resolved: clientIp(req),
        socketPeer: socketPeerIp(req),
        forwarded: forwardedChain(req).map((address) => ({
          address,
          trusted: isTrustedProxyAddress(address),
        })),
        onCloudRun: Boolean(process.env.K_SERVICE),
        trustedProxyHops: process.env.TRUSTED_PROXY_HOPS || null,
        trustedProxyCidrs: process.env.TRUSTED_PROXY_CIDRS || null,
      });
    } catch (error) {
      const status = (error as { status?: number })?.status;
      return res.status(typeof status === 'number' ? status : 500).json({
        error: error instanceof Error ? error.message : 'Failed to read client IP',
      });
    }
  });

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
