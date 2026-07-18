import type { Express, Request, Response } from 'express';
import {
  AccessPinRecord,
  AccessPinRole,
  canRedeemPin,
  generatePinCode,
  pinDocId,
  syntheticEmail,
  uidForPinRedeem,
} from './accessPinCrypto.ts';
import { getAdminAuth, getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';

const PINS = 'access_pins';

async function verifyBearer(req: Request): Promise<{ uid: string; admin: boolean; farmId?: string; role?: string }> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw Object.assign(new Error('Missing Authorization bearer token'), { status: 401 });

  const decoded = await getAdminAuth().verifyIdToken(token);
  const farmId = typeof decoded.farmId === 'string' ? decoded.farmId : undefined;
  const role = typeof decoded.role === 'string' ? decoded.role : undefined;

  let isAdmin = decoded.admin === true || role === 'admin';
  if (!isAdmin) {
    const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
    if (userSnap.exists && userSnap.data()?.role === 'admin') isAdmin = true;
  }

  return { uid: decoded.uid, admin: isAdmin, farmId, role };
}

export function registerAccessPinRoutes(app: Express) {
  app.post('/api/auth/redeem-pin', async (req: Request, res: Response) => {
    try {
      if (!isAdminSdkReady()) {
        return res.status(503).json({
          error: 'Invite PIN auth is not configured (missing Firebase Admin credentials in secrets/).',
        });
      }

      const pin = String(req.body?.pin || '');
      const displayName = String(req.body?.displayName || '').trim();
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

      const uid = uidForPinRedeem(pin, displayName);
      const email = syntheticEmail(uid);
      const existingUser = await auth.getUser(uid).catch(() => null);

      if (!existingUser) {
        await auth.createUser({
          uid,
          email,
          displayName,
          emailVerified: true,
          disabled: false,
        });
      } else {
        await auth.updateUser(uid, { displayName });
      }

      await auth.setCustomUserClaims(uid, {
        pinAuth: true,
        admin: record.role === 'admin',
        farmId: record.farmId,
        role: record.role,
      });

      const now = new Date().toISOString();
      const userPayload = {
        uid,
        email,
        displayName,
        role: record.role,
        farmId: record.farmId,
        subscriptionTier: 'free',
        hasAgreedToTerms: true,
        agreedToTermsAt: now,
        createdAt: existingUser ? undefined : now,
        authMethod: 'invite_pin',
      };
      Object.keys(userPayload).forEach((k) => {
        if ((userPayload as Record<string, unknown>)[k] === undefined) {
          delete (userPayload as Record<string, unknown>)[k];
        }
      });

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

      // Ensure farm doc exists for owner pins
      const farmRef = db.collection('farms').doc(record.farmId);
      const farmSnap = await farmRef.get();
      if (!farmSnap.exists) {
        await farmRef.set({
          id: record.farmId,
          name: 'Orchard',
          ownerUid: uid,
          createdAt: now,
        });
      }

      await ref.set(
        {
          useCount: (record.useCount || 0) + 1,
          lastRedeemedAt: now,
          lastRedeemedBy: uid,
        },
        { merge: true }
      );

      const customToken = await auth.createCustomToken(uid, {
        pinAuth: true,
        farmId: record.farmId,
        role: record.role,
        admin: record.role === 'admin',
      });

      return res.json({
        token: customToken,
        farmId: record.farmId,
        role: record.role,
        displayName,
        uid,
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

      const role = (req.body?.role || 'farmer') as AccessPinRole;
      if (!['admin', 'farmer', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' });
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
        return {
          pinId: d.id,
          label: data.label,
          role: data.role,
          active: data.active,
          maxUses: data.maxUses,
          useCount: data.useCount,
          expiresAt: data.expiresAt,
          createdAt: data.createdAt,
          codeHint: data.codeHint || null,
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
      const role = String(req.body?.role || '') as AccessPinRole;
      if (!targetUid) return res.status(400).json({ error: 'uid required' });
      if (!['admin', 'farmer', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' });
      }
      if (targetUid === caller.uid) {
        return res.status(400).json({ error: 'You cannot change your own role here.' });
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

      await targetRef.set({ role }, { merge: true });
      await db.collection('users_public').doc(targetUid).set({ role, farmId }, { merge: true });

      const authUser = await getAdminAuth().getUser(targetUid);
      const prior = (authUser.customClaims || {}) as Record<string, unknown>;
      await getAdminAuth().setCustomUserClaims(targetUid, {
        ...prior,
        admin: role === 'admin',
        farmId,
        role,
        pinAuth:
          prior.pinAuth === true || targetSnap.data()?.authMethod === 'invite_pin',
      });

      return res.json({ ok: true, uid: targetUid, role });
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
      const callerSnap = await db.collection('users').doc(caller.uid).get();
      const farmId = caller.farmId || callerSnap.data()?.farmId;
      if (!farmId) return res.status(400).json({ error: 'No farmId on admin profile.' });

      const targetRef = db.collection('users').doc(targetUid);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists || targetSnap.data()?.farmId !== farmId) {
        return res.status(404).json({ error: 'Member not found on this farm.' });
      }

      const privateFarmId = `farm_${targetUid}`;
      await targetRef.set({ farmId: privateFarmId, role: 'admin' }, { merge: true });
      await db.collection('users_public').doc(targetUid).set(
        { farmId: privateFarmId, role: 'admin' },
        { merge: true }
      );

      const authUser = await getAdminAuth().getUser(targetUid);
      const prior = (authUser.customClaims || {}) as Record<string, unknown>;
      await getAdminAuth().setCustomUserClaims(targetUid, {
        ...prior,
        admin: true,
        farmId: privateFarmId,
        role: 'admin',
        pinAuth:
          prior.pinAuth === true || targetSnap.data()?.authMethod === 'invite_pin',
      });

      return res.json({ ok: true, uid: targetUid });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to remove member',
      });
    }
  });
}
