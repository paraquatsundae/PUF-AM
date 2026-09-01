import type { Express, Request, Response } from 'express';
import {
  allFarmModules,
  clampModulesToFarm,
  effectiveModules,
  resolveFarmEnabledModules,
  sanitizeModules,
  type FarmModuleId,
} from '../shared/auth/farmModules.ts';
import { checkInviteClaim } from '../shared/auth/inviteLimits.ts';
import {
  canRedeemPin,
  pinDocId,
  syntheticEmail,
  uidForPinRedeem,
  generatePinCode,
  type AccessPinRecord,
  type AccessPinRole,
} from './accessPinCrypto.ts';
import {
  getAdminAuth,
  getAdminDb,
  getAdminFieldValue,
  isAdminSdkReady,
} from './firebaseAdmin.ts';
import {
  PINS,
  clientKey,
  existingClaimsFor,
  farmMemberClaims,
  loadFarmEnabledModules,
  rateLimit,
  verifyBearer,
} from './accessPinAuth.ts';

/**
 * One shape rather than a discriminated union: `strictNullChecks` is off in this
 * repo, so `if (result.ok)` would not narrow and every field access would need
 * an `in` guard. See `Plans/CODEBASE_HEALTH.md` — Layering.
 */
type PinReservation = {
  status?: number;
  message?: string;
  record?: AccessPinRecord;
  /** This redeem is what bound the PIN, so a rollback must unbind it. */
  bound?: boolean;
};

export function registerAccessPinMemberRoutes(app: Express) {
  app.post('/api/auth/redeem-pin', async (req: Request, res: Response) => {
    // A closure rather than the ref itself: the Firestore types come from a
    // lazily-required SDK, so there is no static handle to annotate here.
    let releaseReservation: (() => Promise<void>) | null = null;
    let redeemed = false;

    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({
          error: 'Invite PIN auth is not configured (missing Firebase Admin credentials in secrets/).',
        });
      }
      if (!rateLimit(clientKey(req, 'redeem-pin'), 30, 15 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many PIN attempts. Try again later.' });
      }

      const pin = String(req.body?.pin || '');
      const displayName = String(req.body?.displayName || '').trim();
      const expectedFarmId =
        typeof req.body?.expectedFarmId === 'string' ? req.body.expectedFarmId.trim() : '';
      if (!pin || pin.replace(/[\s-]/g, '').length < 6) {
        return res.status(400).json({ error: 'Enter a valid invite PIN.' });
      }
      if (!displayName || displayName.length < 2) {
        return res.status(400).json({ error: 'Enter your name (used to reopen the same session later).' });
      }

      const db = getAdminDb();
      const auth = getAdminAuth();
      const docId = pinDocId(pin);
      const ref = db.collection(PINS).doc(docId);

      /**
       * Claim the use before doing any account work.
       *
       * `canRedeemPin` used to read `useCount` here while the increment landed
       * ninety lines further down, after `createUser`, `setCustomUserClaims`
       * and two user writes. Two tablets redeeming the same single-use PIN both
       * passed the check inside that window and both wrote `useCount: 1`, so
       * `maxUses` was advisory. Checking and claiming have to be one step.
       */
      // Derived from pin + displayName, so it is known before the transaction
      // and can be matched against the PIN's binding inside it.
      const uid = uidForPinRedeem(pin, displayName);

      const reservation = await db.runTransaction(async (tx): Promise<PinReservation> => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          return { status: 404, message: 'Invite PIN not found.' };
        }

        const pinRecord = snap.data() as AccessPinRecord;
        const check = canRedeemPin(pinRecord);
        if (check.ok === false) {
          return { status: 403, message: check.reason };
        }
        /**
         * An admin PIN belongs to the first person who redeems it. Checked in
         * the same transaction as the use claim, otherwise two people racing
         * the same admin code would both read `claimedBy` empty and both end
         * up admins — the bug `useCount` already had.
         */
        const claim = checkInviteClaim(pinRecord, uid);
        if (claim.ok === false) {
          return { status: 403, message: claim.reason };
        }
        if (expectedFarmId && pinRecord.farmId !== expectedFarmId) {
          return {
            status: 403,
            message:
              'That PIN is not for the farm you selected. Pick the right farm or ask for a new PIN.',
          };
        }

        tx.set(
          ref,
          {
            useCount: (pinRecord.useCount || 0) + 1,
            ...(claim.bind ? { claimedBy: uid, claimedDisplayName: displayName } : {}),
          },
          { merge: true }
        );
        return { record: pinRecord, bound: claim.bind };
      });

      if (reservation.status) {
        return res.status(reservation.status).json({ error: reservation.message });
      }

      const record = reservation.record;
      releaseReservation = async () => {
        // `increment` rather than a re-read: the compensation must not race the
        // next redeem the way the original increment did.
        await ref.set(
          {
            useCount: getAdminFieldValue().increment(-1),
            // A redeem that never completed must not leave the PIN bound to a
            // uid that has no account, or the invite is dead for everyone.
            ...(reservation.bound
              ? {
                  claimedBy: getAdminFieldValue().delete(),
                  claimedDisplayName: getAdminFieldValue().delete(),
                }
              : {}),
          },
          { merge: true }
        );
      };

      const farmRef = db.collection('farms').doc(record.farmId);
      const farmSnap = await farmRef.get();
      if (!farmSnap.exists) {
        return res.status(404).json({
          error: 'This farm no longer exists. Ask the owner for a new invite.',
        });
      }
      const farmEnabled = resolveFarmEnabledModules(farmSnap.data()?.enabledModules);

      const email = syntheticEmail(uid);
      const existingUser = await auth.getUser(uid).catch(() => null);
      const priorUserSnap = await db.collection('users').doc(uid).get();
      const priorEpoch =
        typeof priorUserSnap.data()?.authEpoch === 'number' ? priorUserSnap.data()!.authEpoch : 0;
      const authEpoch = Math.max(1, priorEpoch);

      const modules = effectiveModules(
        record.role,
        record.modules ?? allFarmModules(),
        farmEnabled
      );

      if (!existingUser) {
        await auth.createUser({
          uid,
          email,
          displayName,
          emailVerified: true,
          disabled: false,
        });
      } else {
        await auth.updateUser(uid, { displayName, disabled: false });
      }

      const claims = farmMemberClaims(
        {
          farmId: record.farmId,
          role: record.role,
          modules,
          authEpoch,
          farmEnabled,
        },
        await existingClaimsFor(uid)
      );
      await auth.setCustomUserClaims(uid, claims);

      const now = new Date().toISOString();
      const userPayload: Record<string, unknown> = {
        uid,
        email,
        displayName,
        role: record.role,
        farmId: record.farmId,
        modules,
        authEpoch,
        accessRevoked: false,
        subscriptionTier: 'free',
        hasAgreedToTerms: true,
        agreedToTermsAt: now,
        authMethod: 'invite_pin',
      };
      if (!existingUser) userPayload.createdAt = now;

      await db.collection('users').doc(uid).set(userPayload, { merge: true });
      await db.collection('users_public').doc(uid).set(
        {
          uid,
          displayName,
          role: record.role,
          farmId: record.farmId,
        },
        { merge: true }
      );

      // `useCount` was already claimed by the reservation above; this is the
      // audit trail, which no longer needs to be atomic with the check.
      await ref.set(
        {
          lastRedeemedAt: now,
          lastRedeemedBy: uid,
          lastRedeemedDisplayName: displayName,
        },
        { merge: true }
      );

      const customToken = await auth.createCustomToken(uid, claims);

      redeemed = true;
      return res.json({
        token: customToken,
        farmId: record.farmId,
        role: record.role,
        displayName,
        uid,
        modules,
        authEpoch,
      });
    } catch (error) {
      console.error('[auth] redeem-pin failed:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to redeem invite PIN',
      });
    } finally {
      // The use is claimed up front, so *any* exit short of handing back a token
      // would otherwise burn one of a limited-use PIN for a member who never got
      // in. In `finally` rather than `catch` because the early returns — a farm
      // that no longer exists, most of all — are not throws.
      if (releaseReservation && !redeemed) {
        await releaseReservation().catch((releaseError) => {
          console.error('[auth] redeem-pin could not release the reserved use:', releaseError);
        });
      }
    }
  });

  app.post('/api/auth/create-pin', async (req: Request, res: Response) => {
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({ error: 'Firebase Admin not configured.' });
      }

      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can create invite PINs.' });
      }

      const userSnap = await getAdminDb().collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || userSnap.data()?.farmId;
      if (!farmId) {
        return res.status(400).json({ error: 'No farmId on admin profile.' });
      }
      const requestedFarmId =
        typeof req.body?.farmId === 'string' && req.body.farmId ? req.body.farmId : '';
      if (requestedFarmId && requestedFarmId !== farmId) {
        return res.status(403).json({ error: 'You can only create PINs for your own farm.' });
      }

      const farmEnabled = await loadFarmEnabledModules(farmId);

      const role = (req.body?.role || 'farmer') as AccessPinRole;
      if (!['admin', 'farmer', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' });
      }

      const requested =
        role === 'admin'
          ? farmEnabled
          : sanitizeModules(req.body?.modules).length > 0
            ? sanitizeModules(req.body?.modules)
            : sanitizeModules(farmEnabled.filter((m) => m !== 'farm_management'));
      const modules = clampModulesToFarm(requested, farmEnabled);
      if (role !== 'admin' && modules.length === 0) {
        return res.status(400).json({
          error: 'Select at least one module that this farm has enabled.',
        });
      }

      const label = String(req.body?.label || 'Invite').slice(0, 80);
      const maxUses =
        req.body?.maxUses === null || req.body?.maxUses === undefined
          ? null
          : Number(req.body.maxUses);
      const expiresInDays =
        req.body?.expiresInDays === null || req.body?.expiresInDays === undefined
          ? 90
          : Number(req.body.expiresInDays);

      const code = generatePinCode(8);
      const docId = pinDocId(code);
      const now = new Date();
      const expiresAt =
        expiresInDays && expiresInDays > 0
          ? new Date(now.getTime() + expiresInDays * 86400000).toISOString()
          : null;

      const record: AccessPinRecord = {
        farmId,
        role,
        label,
        active: true,
        maxUses: Number.isFinite(maxUses) ? maxUses : null,
        useCount: 0,
        expiresAt,
        createdBy: caller.uid,
        createdAt: now.toISOString(),
        modules,
        codeHint: `${code.slice(0, 2)}••••${code.slice(-2)}`,
      };

      await getAdminDb().collection(PINS).doc(docId).set(record);

      return res.json({
        code,
        pinId: docId,
        ...record,
      });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      console.error('[auth] create-pin failed:', error);
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to create invite PIN',
      });
    }
  });

  app.get('/api/auth/pins', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can list invite PINs.' });
      }

      const userSnap = await getAdminDb().collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || userSnap.data()?.farmId;
      if (!farmId) return res.json({ pins: [] });

      const snap = await getAdminDb().collection(PINS).where('farmId', '==', farmId).get();
      const pins = snap.docs.map((d) => {
        const data = d.data() as AccessPinRecord;
        const label =
          (typeof data.label === 'string' && data.label.trim()) ||
          `${data.role || 'invite'} PIN`;
        return {
          pinId: d.id,
          label,
          role: data.role,
          active: data.active,
          maxUses: data.maxUses,
          useCount: data.useCount,
          expiresAt: data.expiresAt,
          createdAt: data.createdAt,
          codeHint: data.codeHint || null,
          modules: data.modules || [],
          lastRedeemedAt: data.lastRedeemedAt || null,
          lastRedeemedDisplayName: data.lastRedeemedDisplayName || null,
        };
      });

      pins.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.json({ pins });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to list PINs',
      });
    }
  });

  app.post('/api/auth/revoke-pin', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can revoke invite PINs.' });
      }

      const pinId = String(req.body?.pinId || '');
      if (!pinId) return res.status(400).json({ error: 'pinId required' });

      const ref = getAdminDb().collection(PINS).doc(pinId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'PIN not found' });

      const userSnap = await getAdminDb().collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || userSnap.data()?.farmId;
      if (snap.data()?.farmId !== farmId) {
        return res.status(403).json({ error: 'PIN belongs to another farm.' });
      }

      await ref.set({ active: false }, { merge: true });
      return res.json({ ok: true });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to revoke PIN',
      });
    }
  });
}
