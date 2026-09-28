import type { Express, Request, Response } from 'express';
import { STAFF_INVITE_DEVICE_CAP } from '../shared/auth/inviteLimits.ts';
import { generatePinCode, pinDocId, type AccessPinRecord } from './accessPinCrypto.ts';
import { getAdminDb, isAdminSdkReady } from './firebaseAdmin.ts';
import { PINS, verifyBearer } from './accessPinAuth.ts';

const MAX_DEVICE_CAP = 99;

async function farmPin(req: Request, pinId: string) {
  if (!isAdminSdkReady()) return { status: 503, error: 'Firebase Admin not configured.' };
  const caller = await verifyBearer(req);
  if (!caller.admin) return { status: 403, error: 'Only farm admins can change invite PINs.' };
  if (!pinId) return { status: 400, error: 'pinId required' };

  const userSnap = await getAdminDb().collection('users').doc(caller.uid).get();
  const farmId = caller.farmId || userSnap.data()?.farmId;
  if (!farmId) return { status: 400, error: 'No farmId on admin profile.' };

  const ref = getAdminDb().collection(PINS).doc(pinId);
  const snap = await ref.get();
  if (!snap.exists) return { status: 404, error: 'PIN not found' };
  const data = snap.data() as AccessPinRecord;
  if (data.farmId !== farmId) return { status: 403, error: 'PIN belongs to another farm.' };
  return { ref, data, farmId, uid: caller.uid };
}

export function registerAccessPinLimitRoutes(app: Express) {
  app.post('/api/auth/pin-uses', async (req: Request, res: Response) => {
    try {
      const pinId = String(req.body?.pinId || '');
      const found = await farmPin(req, pinId);
      if ('error' in found) return res.status(found.status).json({ error: found.error });
      if (found.data.maxUses == null) {
        return res.status(400).json({ error: 'This PIN has no device cap.' });
      }
      const add = Number(req.body?.addUses ?? STAFF_INVITE_DEVICE_CAP);
      if (!Number.isInteger(add) || add < 1 || add > 30) {
        return res.status(400).json({ error: 'Add between 1 and 30 device uses.' });
      }
      const maxUses = Math.min(MAX_DEVICE_CAP, found.data.maxUses + add);
      await found.ref.set({ maxUses }, { merge: true });
      return res.json({ ok: true, pinId, maxUses });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to raise the device cap',
      });
    }
  });

  app.post('/api/auth/link-pin', async (req: Request, res: Response) => {
    try {
      const pinId = String(req.body?.pinId || '');
      const found = await farmPin(req, pinId);
      if ('error' in found) return res.status(found.status).json({ error: found.error });
      const source = found.data;
      if (source.active === false) {
        return res.status(400).json({ error: 'Revoked PINs cannot be linked. Mint a new invite instead.' });
      }

      const code = generatePinCode(8);
      const docId = pinDocId(code);
      const now = new Date().toISOString();
      const linkId = source.linkId || pinId;
      const heldForDisplayName = source.claimedDisplayName || source.lastRedeemedDisplayName || null;
      const heldForUid = heldForDisplayName
        ? source.claimedBy || source.lastRedeemedBy || null
        : null;
      const maxUses = source.role === 'admin' ? null : source.maxUses ?? STAFF_INVITE_DEVICE_CAP;

      const record: AccessPinRecord = {
        farmId: found.farmId,
        role: source.role,
        label: source.label,
        active: true,
        maxUses,
        useCount: 0,
        expiresAt: source.expiresAt || null,
        createdBy: found.uid,
        createdAt: now,
        modules: source.modules,
        codeHint: `${code.slice(0, 2)}••••${code.slice(-2)}`,
        linkId,
        ...(heldForUid ? { heldForUid, heldForDisplayName } : {}),
      };

      await found.ref.set({ linkId }, { merge: true });
      await getAdminDb().collection(PINS).doc(docId).set(record);
      return res.json({
        code,
        pinId: docId,
        linkId,
        heldForDisplayName,
        ...record,
      });
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status || 500;
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Failed to issue a linked PIN',
      });
    }
  });
}
