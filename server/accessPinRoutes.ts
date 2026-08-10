import type { Express, Request, Response } from 'express';
import {
  allFarmModules,
  clampModulesToFarm,
  defaultModulesWithoutCropPacks,
  effectiveModules,
  resolveFarmEnabledModules,
  sanitizeModules,
  type FarmModuleId,
} from '../shared/auth/farmModules.ts';
import {
  encodeGeohash,
  geohashNeighbors,
  haversineKm,
  parseGeoInput,
  type FarmPublicDiscovery,
} from '../shared/geo/geohash.ts';
import {
  AccessPinRecord,
  AccessPinRole,
  canRedeemPin,
  generatePinCode,
  newFarmId,
  pinDocId,
  syntheticEmail,
  uidForPinRedeem,
} from './accessPinCrypto.ts';
import {
  markEnrollmentCodeUsed,
  releaseEnrollmentCode,
  reserveEnrollmentCode,
} from './enrollmentCodes.ts';
import { getAdminAuth, getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';

const PINS = 'access_pins';
const FARMS_PUBLIC = 'farms_public';
const GEO_PRECISION = 5;

/** Simple sliding-window rate limit (per process). */
const rateBuckets = new Map<string, number[]>();

function clientKey(req: Request, suffix: string): string {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : '') ||
    req.socket.remoteAddress ||
    'unknown';
  return `${suffix}:${ip}`;
}

function rateLimit(key: string, max: number, windowMs: number): boolean {
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

async function verifyBearer(req: Request): Promise<{
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

  let isAdmin = decoded.admin === true || role === 'admin';
  if (!isAdmin) {
    const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
    if (userSnap.exists && userSnap.data()?.role === 'admin') isAdmin = true;
  }

  return { uid: decoded.uid, admin: isAdmin, farmId, role, authEpoch };
}

function claimsForMember(input: {
  farmId: string;
  role: AccessPinRole;
  modules: FarmModuleId[];
  authEpoch: number;
  pinAuth?: boolean;
  farmEnabled?: unknown;
}) {
  const modules = effectiveModules(input.role, input.modules, input.farmEnabled);
  return {
    pinAuth: input.pinAuth !== false,
    admin: input.role === 'admin',
    farmId: input.farmId,
    role: input.role,
    modules,
    authEpoch: input.authEpoch,
  };
}

async function loadFarmEnabledModules(farmId: string): Promise<FarmModuleId[]> {
  const snap = await getAdminDb().collection('farms').doc(farmId).get();
  return resolveFarmEnabledModules(snap.data()?.enabledModules);
}

export function registerAccessPinRoutes(app: Express) {
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
      const showNearby = req.body?.showNearby !== false;

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
      // New farms start without crop packs (e.g. blight). Enable when walnuts are configured.
      const modules = defaultModulesWithoutCropPacks();
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

      const claims = claimsForMember({
        farmId,
        role: 'admin',
        modules,
        authEpoch,
        farmEnabled: modules,
      });
      await auth.setCustomUserClaims(uid, claims);

      const farmDoc: Record<string, unknown> = {
        id: farmId,
        name: farmName.slice(0, 120),
        ownerUid: uid,
        createdAt: now,
        // Core modules only — walnut blight unlocked from Farm setup when applicable.
        enabledModules: modules,
        farmProfile: {
          enterprises: [],
          livestockEnabled: false,
          defaultSpeciesId: '',
        },
      };
      if (geo) {
        farmDoc.lat = geo.lat;
        farmDoc.lng = geo.lng;
        farmDoc.showNearby = showNearby;
      }
      await db.collection('farms').doc(farmId).set(farmDoc);

      // Empty farm profile so walnut pack stays off until Farm setup configures walnuts.
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

      if (geo && showNearby) {
        const discovery: FarmPublicDiscovery = {
          farmId,
          name: farmName.slice(0, 120),
          lat: geo.lat,
          lng: geo.lng,
          geohash: encodeGeohash(geo.lat, geo.lng, GEO_PRECISION),
          showNearby: true,
          updatedAt: now,
        };
        await db.collection(FARMS_PUBLIC).doc(farmId).set(discovery);
      }

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

  app.post('/api/auth/redeem-pin', async (req: Request, res: Response) => {
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
      const snap = await ref.get();

      if (!snap.exists) {
        return res.status(404).json({ error: 'Invite PIN not found.' });
      }

      const record = snap.data() as AccessPinRecord;
      const check = canRedeemPin(record);
      if (check.ok === false) {
        return res.status(403).json({ error: check.reason });
      }

      if (expectedFarmId && record.farmId !== expectedFarmId) {
        return res.status(403).json({
          error: 'That PIN is not for the farm you selected. Pick the right farm or ask for a new PIN.',
        });
      }

      const farmRef = db.collection('farms').doc(record.farmId);
      const farmSnap = await farmRef.get();
      if (!farmSnap.exists) {
        return res.status(404).json({
          error: 'This farm no longer exists. Ask the owner for a new invite.',
        });
      }
      const farmEnabled = resolveFarmEnabledModules(farmSnap.data()?.enabledModules);

      const uid = uidForPinRedeem(pin, displayName);
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

      const claims = claimsForMember({
        farmId: record.farmId,
        role: record.role,
        modules,
        authEpoch,
        farmEnabled,
      });
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

      await ref.set(
        {
          useCount: (record.useCount || 0) + 1,
          lastRedeemedAt: now,
          lastRedeemedBy: uid,
          lastRedeemedDisplayName: displayName,
        },
        { merge: true }
      );

      const customToken = await auth.createCustomToken(uid, claims);

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
      const farmId =
        (typeof req.body?.farmId === 'string' && req.body.farmId) ||
        caller.farmId ||
        userSnap.data()?.farmId;
      if (!farmId) {
        return res.status(400).json({ error: 'No farmId on admin profile.' });
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

      const claims = claimsForMember({
        farmId,
        role,
        modules,
        authEpoch,
        farmEnabled,
        pinAuth:
          targetSnap.data()?.authMethod === 'invite_pin' ||
          (await getAdminAuth().getUser(targetUid).then((u) => u.customClaims?.pinAuth === true).catch(() => false)),
      });
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

      await auth.setCustomUserClaims(targetUid, {
        pinAuth: true,
        admin: false,
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

  /** Unauthenticated: list discoverable farms near lat/lng (for join UI). */
  app.get('/api/auth/nearby-farms', async (req: Request, res: Response) => {
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({ error: 'Farm auth is not configured.' });
      }
      if (!rateLimit(clientKey(req, 'nearby-farms'), 60, 15 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many nearby lookups. Try later.' });
      }

      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const radiusKm = Math.min(Math.max(Number(req.query.radiusKm) || 3, 0.5), 25);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'lat and lng query params required.' });
      }

      const cell = encodeGeohash(lat, lng, GEO_PRECISION);
      const prefixes = geohashNeighbors(cell);
      const db = getAdminDb();
      const seen = new Map<string, FarmPublicDiscovery & { distanceKm: number }>();

      await Promise.all(
        prefixes.map(async (prefix) => {
          const snap = await db
            .collection(FARMS_PUBLIC)
            .where('showNearby', '==', true)
            .where('geohash', '==', prefix)
            .limit(40)
            .get();
          for (const doc of snap.docs) {
            const data = doc.data() as FarmPublicDiscovery;
            if (!data.showNearby) continue;
            const distanceKm = haversineKm(lat, lng, data.lat, data.lng);
            if (distanceKm > radiusKm) continue;
            const prev = seen.get(data.farmId);
            if (!prev || distanceKm < prev.distanceKm) {
              seen.set(data.farmId, { ...data, farmId: data.farmId || doc.id, distanceKm });
            }
          }
        })
      );

      const farms = [...seen.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 20);
      return res.json({ farms, cell, radiusKm });
    } catch (error) {
      console.error('[auth] nearby-farms failed:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list nearby farms',
      });
    }
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
          const claims = claimsForMember({
            farmId,
            role: 'admin',
            modules: enabledModules,
            authEpoch,
            farmEnabled: enabledModules,
            pinAuth:
              ownerSnap.data()?.authMethod === 'invite_pin' ||
              (await getAdminAuth()
                .getUser(ownerUid)
                .then((u) => u.customClaims?.pinAuth === true)
                .catch(() => false)),
          });
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

  app.post('/api/auth/update-farm-discovery', async (req: Request, res: Response) => {
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({ error: 'Firebase Admin not configured.' });
      }
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can update farm discovery.' });
      }

      const db = getAdminDb();
      const callerSnap = await db.collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || callerSnap.data()?.farmId;
      if (!farmId) return res.status(400).json({ error: 'No farmId on admin profile.' });

      const farmRef = db.collection('farms').doc(farmId);
      const farmSnap = await farmRef.get();
      if (!farmSnap.exists) return res.status(404).json({ error: 'Farm not found.' });

      const name = String(farmSnap.data()?.name || 'Orchard').slice(0, 120);
      const showNearby = req.body?.showNearby !== false;
      const geo = parseGeoInput(req.body);
      const now = new Date().toISOString();

      if (!geo) {
        await farmRef.set({ showNearby: false }, { merge: true });
        await db.collection(FARMS_PUBLIC).doc(farmId).delete().catch(() => undefined);
        return res.json({ ok: true, showNearby: false });
      }

      await farmRef.set(
        { lat: geo.lat, lng: geo.lng, showNearby },
        { merge: true }
      );

      if (showNearby) {
        const discovery: FarmPublicDiscovery = {
          farmId,
          name,
          lat: geo.lat,
          lng: geo.lng,
          geohash: encodeGeohash(geo.lat, geo.lng, GEO_PRECISION),
          showNearby: true,
          updatedAt: now,
        };
        await db.collection(FARMS_PUBLIC).doc(farmId).set(discovery);
        return res.json({ ok: true, ...discovery });
      }

      await db.collection(FARMS_PUBLIC).doc(farmId).delete().catch(() => undefined);
      return res.json({ ok: true, showNearby: false });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to update farm discovery',
      });
    }
  });
}
