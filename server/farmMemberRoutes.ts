/**
 * Farm member roster: list, change role/modules, remove.
 *
 * Split out of `accessPinMemberRoutes.ts`, which had grown past the 600-line
 * new-file limit in `Plans/CODEBASE_HEALTH.md`. These three routes act on
 * members who already exist; the invite PIN routes next door act on codes that
 * create them. The only shared machinery is claims and epoch bumping, both of
 * which already live in `accessPinAuth.ts`.
 */
import type { Express, Request, Response } from 'express';
import { clampModulesToFarm, sanitizeModules } from '../shared/auth/farmModules.ts';
import type { AccessPinRole } from './accessPinCrypto.ts';
import { getAdminAuth, getAdminDb } from './firebaseAdmin.ts';
import { resolvePlatformAdminClaim } from './memberClaims.ts';
import {
  existingClaimsFor,
  farmMemberClaims,
  loadFarmEnabledModules,
  verifyBearer,
} from './accessPinAuth.ts';

export function registerFarmMemberRoutes(app: Express) {
  app.get('/api/auth/members', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can list members.' });
      }

      const userSnap = await getAdminDb().collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || userSnap.data()?.farmId;
      if (!farmId) return res.json({ members: [] });

      const snap = await getAdminDb().collection('users').where('farmId', '==', farmId).get();
      const members = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          displayName: data.displayName || 'User',
          email: data.email || null,
          role: data.role || 'farmer',
          farmId: data.farmId,
          modules: data.modules || [],
          authEpoch: data.authEpoch ?? 1,
          accessRevoked: data.accessRevoked === true,
          authMethod: data.authMethod || null,
          createdAt: data.createdAt || null,
        };
      });

      members.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
      return res.json({ members });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to list members',
      });
    }
  });

  app.post('/api/auth/update-member', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can update members.' });
      }

      const targetUid = String(req.body?.uid || '');
      if (!targetUid) return res.status(400).json({ error: 'uid required' });
      if (targetUid === caller.uid) {
        return res.status(400).json({ error: 'You cannot change your own role or modules here.' });
      }

      const db = getAdminDb();
      const callerSnap = await db.collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || callerSnap.data()?.farmId;
      if (!farmId) return res.status(400).json({ error: 'No farmId on admin profile.' });

      const targetRef = db.collection('users').doc(targetUid);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists || targetSnap.data()?.farmId !== farmId) {
        return res.status(404).json({ error: 'Member not found on this farm.' });
      }

      const priorRole = (targetSnap.data()?.role || 'farmer') as AccessPinRole;
      const role = (
        req.body?.role != null ? String(req.body.role) : priorRole
      ) as AccessPinRole;
      if (!['admin', 'farmer', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' });
      }

      const farmEnabled = await loadFarmEnabledModules(farmId);

      const modules =
        role === 'admin'
          ? farmEnabled
          : clampModulesToFarm(
              req.body?.modules !== undefined
                ? sanitizeModules(req.body.modules)
                : sanitizeModules(targetSnap.data()?.modules),
              farmEnabled
            );

      if (role !== 'admin' && modules.length === 0) {
        return res.status(400).json({ error: 'Select at least one module enabled on this farm.' });
      }

      const priorEpoch =
        typeof targetSnap.data()?.authEpoch === 'number' ? targetSnap.data()!.authEpoch : 1;
      const authEpoch = priorEpoch + 1;

      await targetRef.set(
        { role, modules, authEpoch, accessRevoked: false },
        { merge: true }
      );
      await db.collection('users_public').doc(targetUid).set({ role, farmId }, { merge: true });

      const existing = await existingClaimsFor(targetUid);
      const claims = farmMemberClaims(
        {
          farmId,
          role,
          modules,
          authEpoch,
          farmEnabled,
          pinAuth:
            targetSnap.data()?.authMethod === 'invite_pin' || existing.pinAuth === true,
        },
        existing
      );
      await getAdminAuth().setCustomUserClaims(targetUid, claims);

      return res.json({ ok: true, uid: targetUid, role, modules, authEpoch });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to update member',
      });
    }
  });

  app.post('/api/auth/remove-member', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can remove members.' });
      }

      const targetUid = String(req.body?.uid || '');
      if (!targetUid) return res.status(400).json({ error: 'uid required' });
      if (targetUid === caller.uid) {
        return res.status(400).json({ error: 'You cannot remove yourself.' });
      }

      const db = getAdminDb();
      const auth = getAdminAuth();
      const callerSnap = await db.collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || callerSnap.data()?.farmId;
      if (!farmId) return res.status(400).json({ error: 'No farmId on admin profile.' });

      const targetRef = db.collection('users').doc(targetUid);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists || targetSnap.data()?.farmId !== farmId) {
        return res.status(404).json({ error: 'Member not found on this farm.' });
      }

      const priorEpoch =
        typeof targetSnap.data()?.authEpoch === 'number' ? targetSnap.data()!.authEpoch : 1;
      const authEpoch = priorEpoch + 1;

      await targetRef.set(
        {
          farmId: null,
          role: 'viewer',
          modules: [],
          accessRevoked: true,
          authEpoch,
          revokedFromFarmId: farmId,
          revokedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await db.collection('users_public').doc(targetUid).set(
        {
          farmId: '',
          role: 'viewer',
          displayName: targetSnap.data()?.displayName || 'User',
          uid: targetUid,
        },
        { merge: true }
      );

      const existing = await existingClaimsFor(targetUid);
      const platformAdmin = resolvePlatformAdminClaim(existing);
      await auth.setCustomUserClaims(targetUid, {
        pinAuth: true,
        admin: platformAdmin,
        platformAdmin,
        farmId: null,
        role: 'viewer',
        modules: [],
        authEpoch,
        accessRevoked: true,
      });
      await auth.revokeRefreshTokens(targetUid);

      return res.json({ ok: true, uid: targetUid });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to remove member',
      });
    }
  });
}
