import type { Express, Request, Response } from 'express';
import { resolveFarmEnabledModules } from '../shared/auth/farmModules.ts';
import {
  defaultModulesWithoutCropPacks,
  planDefaultFarmFeedOnCreate,
} from '../shared/farm/cropPacks.ts';
import { parseGeoInput } from '../shared/geo/geohash.ts';
import {
  generatePinCode,
  newFarmId,
  pinDocId,
  syntheticEmail,
  uidForPinRedeem,
  type AccessPinRecord,
  type AccessPinRole,
} from './accessPinCrypto.ts';
import {
  markEnrollmentCodeUsed,
  releaseEnrollmentCode,
  reserveEnrollmentCode,
} from './enrollmentCodes.ts';
import { getAdminAuth, getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';
import {
  PINS,
  clientKey,
  existingClaimsFor,
  farmMemberClaims,
  rateLimit,
  verifyBearer,
} from './accessPinAuth.ts';

export function registerAccessPinFarmRoutes(app: Express) {
  app.post('/api/auth/create-farm', async (req: Request, res: Response) => {
    // Set once a code is reserved, so every failure path below can give it back.
    let enrollmentHash: string | null = null;
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({
          error: 'Farm auth is not configured (missing Firebase Admin credentials in secrets/).',
        });
      }
      if (!rateLimit(clientKey(req, 'create-farm'), 5, 60 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many farm creations from this network. Try later.' });
      }

      const farmName = String(req.body?.farmName || '').trim();
      const displayName = String(req.body?.displayName || '').trim();
      if (!farmName || farmName.length < 2) {
        return res.status(400).json({ error: 'Enter a farm name (at least 2 characters).' });
      }
      if (!displayName || displayName.length < 2) {
        return res.status(400).json({ error: 'Enter your name (at least 2 characters).' });
      }

      const geo = parseGeoInput(req.body);
      // Nearby browse withdrawn 2026-09-13 — ignore showNearby; never write farms_public.

      // The gate (Plans/FIREBASE_BILLING.md §5.1): a cloud farm on this project
      // costs its owner money, so nobody creates one without a code he issued.
      // Reserved before anything is built — the reservation is the single-use
      // guarantee — and released below if the build fails.
      const enrollment = await reserveEnrollmentCode(String(req.body?.enrollmentCode || ''));
      if (!enrollment.ok || !enrollment.codeHash) {
        return res
          .status(enrollment.status ?? 403)
          .json({ error: enrollment.error ?? 'Enrollment code refused.' });
      }
      enrollmentHash = enrollment.codeHash;

      const db = getAdminDb();
      const auth = getAdminAuth();
      const recoveryCode = generatePinCode(8);
      const farmId = newFarmId();
      const uid = uidForPinRedeem(recoveryCode, displayName);
      const email = syntheticEmail(uid);
      const now = new Date().toISOString();
      // New farms start without crop packs (e.g. blight). Farm feed is default-on.
      const planned = planDefaultFarmFeedOnCreate(defaultModulesWithoutCropPacks(), now);
      const modules = planned.modules;
      const authEpoch = 1;

      const existingUser = await auth.getUser(uid).catch(() => null);
      if (existingUser) {
        await releaseEnrollmentCode(enrollmentHash);
        return res.status(409).json({
          error: 'Could not create account — try a slightly different display name.',
        });
      }

      await auth.createUser({
        uid,
        email,
        displayName,
        emailVerified: true,
        disabled: false,
      });

      const claims = farmMemberClaims(
        {
          farmId,
          role: 'admin',
          modules,
          authEpoch,
          farmEnabled: modules,
        },
        await existingClaimsFor(uid)
      );
      await auth.setCustomUserClaims(uid, claims);

      const farmDoc: Record<string, unknown> = {
        id: farmId,
        name: farmName.slice(0, 120),
        ownerUid: uid,
        createdAt: now,
        // Core modules + default-on farm feed. Crop packs still Install under Settings.
        enabledModules: modules,
        cropPacks: planned.cropPacks,
        farmProfile: {
          enterprises: [],
          livestockEnabled: false,
          defaultSpeciesId: '',
        },
      };
      if (geo) {
        farmDoc.lat = geo.lat;
        farmDoc.lng = geo.lng;
        farmDoc.showNearby = false;
      }
      await db.collection('farms').doc(farmId).set(farmDoc);

      // Empty farm profile — walnut pack install is Settings → Plugins.
      await db
        .collection('farms')
        .doc(farmId)
        .collection('settings')
        .doc('farm')
        .set(
          {
            irrigationSystemType: 'micro',
            farmName: farmName.slice(0, 120),
            farmProfile: {
              enterprises: [],
              livestockEnabled: false,
              defaultSpeciesId: '',
            },
          },
          { merge: true }
        );

      await db.collection('users').doc(uid).set({
        uid,
        email,
        displayName,
        role: 'admin',
        farmId,
        modules,
        authEpoch,
        accessRevoked: false,
        subscriptionTier: 'free',
        hasAgreedToTerms: true,
        agreedToTermsAt: now,
        createdAt: now,
        authMethod: 'invite_pin',
      });

      await db.collection('users_public').doc(uid).set({
        uid,
        displayName,
        role: 'admin',
        farmId,
      });

      const pinRecord: AccessPinRecord = {
        farmId,
        role: 'admin',
        label: 'Owner recovery',
        active: true,
        maxUses: null,
        useCount: 0,
        expiresAt: null,
        createdBy: uid,
        createdAt: now,
        modules,
        codeHint: `${recoveryCode.slice(0, 2)}••••${recoveryCode.slice(-2)}`,
      };
      await db.collection(PINS).doc(pinDocId(recoveryCode)).set(pinRecord);

      const customToken = await auth.createCustomToken(uid, claims);

      await markEnrollmentCodeUsed(enrollmentHash, { farmId, farmName: farmName.slice(0, 120) });

      return res.json({
        token: customToken,
        farmId,
        role: 'admin',
        displayName,
        uid,
        modules,
        authEpoch,
        recoveryPin: recoveryCode,
      });
    } catch (error) {
      if (enrollmentHash) await releaseEnrollmentCode(enrollmentHash);
      console.error('[auth] create-farm failed:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create farm',
      });
    }
  });


  /**
   * Withdrawn 2026-09-13. Public farm browse is unused (join is invite PIN /
   * FarmCode) and was hammerable on am.pufworks.farm. Fail closed: no list,
   * no Admin SDK, no geohash work. Rate-limit-only is not the fix.
   */
  app.get('/api/auth/nearby-farms', (_req: Request, res: Response) => {
    return res.status(410).json({
      error: 'Nearby farm discovery is withdrawn. Join with an invite PIN.',
    });
  });

  /** Admin: update discovery location / visibility for this farm. */
  app.post('/api/auth/update-farm-modules', async (req: Request, res: Response) => {
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({ error: 'Firebase Admin not configured.' });
      }
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can change farm modules.' });
      }

      const db = getAdminDb();
      const callerSnap = await db.collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || callerSnap.data()?.farmId;
      if (!farmId) return res.status(400).json({ error: 'No farmId on admin profile.' });

      const farmRef = db.collection('farms').doc(farmId);
      const farmSnap = await farmRef.get();
      if (!farmSnap.exists) return res.status(404).json({ error: 'Farm not found.' });

      const enabledModules = resolveFarmEnabledModules(req.body?.modules);
      await farmRef.set({ enabledModules }, { merge: true });

      // Keep owner admin claims aligned with the new catalog.
      const ownerUid = String(farmSnap.data()?.ownerUid || caller.uid);
      const ownerSnap = await db.collection('users').doc(ownerUid).get();
      if (ownerSnap.exists && ownerSnap.data()?.farmId === farmId) {
        const role = (ownerSnap.data()?.role || 'admin') as AccessPinRole;
        const authEpoch =
          typeof ownerSnap.data()?.authEpoch === 'number' ? ownerSnap.data()!.authEpoch : 1;
        if (role === 'admin') {
          await db.collection('users').doc(ownerUid).set({ modules: enabledModules }, { merge: true });
          const existing = await existingClaimsFor(ownerUid);
          const claims = farmMemberClaims(
            {
              farmId,
              role: 'admin',
              modules: enabledModules,
              authEpoch,
              farmEnabled: enabledModules,
              pinAuth:
                ownerSnap.data()?.authMethod === 'invite_pin' || existing.pinAuth === true,
            },
            existing
          );
          await getAdminAuth().setCustomUserClaims(ownerUid, claims);
        }
      }

      return res.json({ ok: true, farmId, enabledModules });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to update farm modules',
      });
    }
  });

  /** Withdrawn with GET /api/auth/nearby-farms — do not repopulate farms_public. */
  app.post('/api/auth/update-farm-discovery', (_req: Request, res: Response) => {
    return res.status(410).json({
      error: 'Nearby farm discovery is withdrawn.',
    });
  });
}
