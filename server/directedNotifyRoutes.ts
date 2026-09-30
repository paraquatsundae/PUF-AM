/**
 * Directed highlight / issue alerts.
 *
 * POST /api/auth/notify-directed — one named farm member, toggle on send.
 * POST /api/auth/notify-permission — farm admin allows or blocks a member.
 * POST /api/auth/notify-device — this browser's push token.
 * GET  /api/auth/notify-config — public VAPID key for that browser.
 *
 * Admin SDK only for tokens, the hourly counter, and the permission flag.
 * No messages collection and no function that runs on every highlight.
 *
 * @see Plans/FARM_MESSAGING.md Decision 2026-09-30
 */
import { createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import {
  directedNotifyCopy,
  isDeliverableMailbox,
  isPlausiblePushToken,
  maySendDirectedNotify,
  nextNotifyQuota,
  NOTIFY_DEVICE_CAP,
  unreachableNotifyMessage,
} from '../shared/notify/directedNotify.ts';
import { rateLimit, verifyBearer } from './accessPinAuth.ts';
import { getAdminApp, getAdminDb } from './firebaseAdmin.ts';
import { isNotifyEmailConfigured, sendNotifyMail } from './notifyMail.ts';

const BURST_PER_MINUTE = 6;

function appUrl(): string {
  return (process.env.APP_URL || 'https://am.pufworks.farm').replace(/\/$/, '');
}

function vapidKey(): string {
  return (process.env.FCM_VAPID_KEY || '').trim();
}

function tokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 40);
}

function statusOf(error: unknown): number {
  return (error as { status?: number })?.status || 500;
}

async function senderProfile(uid: string): Promise<{
  role: string;
  farmId: string;
  displayName: string;
  canSendNotifications: boolean;
} | null> {
  const snap = await getAdminDb().collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const farmId = typeof data.farmId === 'string' ? data.farmId : '';
  if (!farmId || data.accessRevoked === true) return null;
  return {
    role: typeof data.role === 'string' ? data.role : 'viewer',
    farmId,
    displayName: typeof data.displayName === 'string' ? data.displayName : 'Someone on the farm',
    canSendNotifications: data.canSendNotifications === true,
  };
}

async function consumeQuota(uid: string, role: string): Promise<void> {
  const ref = getAdminDb().collection('users').doc(uid).collection('notify_quota').doc('hour');
  await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const decision = nextNotifyQuota({
      role,
      windowStart: typeof data.windowStart === 'number' ? data.windowStart : 0,
      count: typeof data.count === 'number' ? data.count : 0,
      now: Date.now(),
    });
    if (!decision.ok) {
      throw Object.assign(
        new Error('Notification limit reached for this hour. Try again later.'),
        { status: 429 }
      );
    }
    tx.set(ref, { windowStart: decision.windowStart, count: decision.count });
  });
}

async function pushToTokens(
  tokens: string[],
  copy: { title: string; body: string },
  link: string
): Promise<{ delivered: boolean; dead: string[] }> {
  if (tokens.length === 0) return { delivered: false, dead: [] };
  const { getMessaging } = (await import('firebase-admin/messaging')) as typeof import('firebase-admin/messaging');
  getAdminApp();
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: copy.title, body: copy.body },
    data: { url: link },
    webpush: { fcmOptions: { link } },
  });
  const dead: string[] = [];
  response.responses.forEach((row, index) => {
    const code = row.error?.code || '';
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      const token = tokens[index];
      if (token) dead.push(token);
    }
  });
  return { delivered: response.successCount > 0, dead };
}

export function registerDirectedNotifyRoutes(app: Express) {
  app.get('/api/auth/notify-config', async (req: Request, res: Response) => {
    try {
      await verifyBearer(req);
      const key = vapidKey();
      return res.json({
        vapidKey: key || null,
        emailConfigured: isNotifyEmailConfigured(),
      });
    } catch (error: unknown) {
      return res.status(statusOf(error)).json({
        error: error instanceof Error ? error.message : 'Failed to load notification config',
      });
    }
  });

  app.post('/api/auth/notify-device', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      const token = String(req.body?.token || '').trim();
      if (!isPlausiblePushToken(token)) {
        return res.status(400).json({ error: 'That push token is not usable.' });
      }
      const db = getAdminDb();
      const col = db.collection('users').doc(caller.uid).collection('notify_devices');
      await col.doc(tokenId(token)).set({
        token,
        platform: 'web',
        updatedAt: new Date().toISOString(),
      });
      const existing = await col.orderBy('updatedAt', 'desc').limit(NOTIFY_DEVICE_CAP + 8).get();
      const extra = existing.docs.slice(NOTIFY_DEVICE_CAP);
      await Promise.all(extra.map((doc) => doc.ref.delete()));
      return res.json({ ok: true });
    } catch (error: unknown) {
      return res.status(statusOf(error)).json({
        error: error instanceof Error ? error.message : 'Failed to save this device',
      });
    }
  });

  app.post('/api/auth/notify-permission', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      if (!caller.admin) {
        return res.status(403).json({ error: 'Only farm admins can change who may send notifications.' });
      }
      const targetUid = String(req.body?.uid || '').trim();
      if (!targetUid) return res.status(400).json({ error: 'uid required' });
      if (targetUid === caller.uid) {
        return res.status(400).json({ error: 'Farm admins can already send notifications.' });
      }
      const allowed = req.body?.allowed === true;
      const sender = await senderProfile(caller.uid);
      if (!sender) return res.status(400).json({ error: 'No farm on your profile.' });
      const targetRef = getAdminDb().collection('users').doc(targetUid);
      const targetSnap = await targetRef.get();
      const target = targetSnap.data();
      if (!targetSnap.exists || target?.farmId !== sender.farmId || target?.accessRevoked === true) {
        return res.status(404).json({ error: 'Member not found on this farm.' });
      }
      if (target?.role === 'admin') {
        return res.status(400).json({ error: 'Farm admins can already send notifications.' });
      }
      await targetRef.set({ canSendNotifications: allowed }, { merge: true });
      return res.json({ ok: true, uid: targetUid, canSendNotifications: allowed });
    } catch (error: unknown) {
      return res.status(statusOf(error)).json({
        error: error instanceof Error ? error.message : 'Failed to update notification permission',
      });
    }
  });

  app.post('/api/auth/notify-directed', async (req: Request, res: Response) => {
    try {
      const caller = await verifyBearer(req);
      const sender = await senderProfile(caller.uid);
      if (!sender) return res.status(400).json({ error: 'No farm on your profile.' });
      if (!maySendDirectedNotify(sender.role, sender.canSendNotifications)) {
        return res.status(403).json({
          error: 'An admin has not allowed you to send notifications.',
        });
      }

      const targetUid = String(req.body?.targetUid || '').trim();
      if (!targetUid || targetUid === caller.uid) {
        return res.status(400).json({ error: 'Choose someone else on the farm.' });
      }
      const farmId = String(req.body?.farmId || '').trim();
      if (farmId && farmId !== sender.farmId) {
        return res.status(403).json({ error: 'That farm is not yours.' });
      }
      const kind = req.body?.kind === 'issue' ? 'issue' : 'highlight';
      const note = String(req.body?.note || '').slice(0, 280);

      const targetSnap = await getAdminDb().collection('users').doc(targetUid).get();
      const target = targetSnap.data();
      if (!targetSnap.exists || target?.farmId !== sender.farmId || target?.accessRevoked === true) {
        return res.status(404).json({ error: 'That person is not on this farm.' });
      }

      if (!rateLimit(`notify:${caller.uid}`, BURST_PER_MINUTE, 60_000)) {
        return res.status(429).json({ error: 'Too many notifications. Wait a minute.' });
      }
      await consumeQuota(caller.uid, sender.role);

      const name = typeof target?.displayName === 'string' ? target.displayName : 'They';
      const email = typeof target?.email === 'string' ? target.email : '';
      const deliverable = isDeliverableMailbox(email);
      const emailOn = isNotifyEmailConfigured();
      const copy = directedNotifyCopy({
        senderName: sender.displayName,
        note,
        kind,
        appUrl: appUrl(),
      });
      const link = `${appUrl()}/map`;

      const deviceSnap = await getAdminDb()
        .collection('users')
        .doc(targetUid)
        .collection('notify_devices')
        .limit(NOTIFY_DEVICE_CAP)
        .get();
      const tokens = deviceSnap.docs
        .map((doc) => (typeof doc.data().token === 'string' ? doc.data().token : ''))
        .filter(isPlausiblePushToken);

      let delivered = false;
      if (tokens.length > 0) {
        try {
          const push = await pushToTokens(tokens, copy, link);
          delivered = push.delivered;
          await Promise.all(
            push.dead.map((token) =>
              getAdminDb()
                .collection('users')
                .doc(targetUid)
                .collection('notify_devices')
                .doc(tokenId(token))
                .delete()
            )
          );
        } catch (error) {
          console.error('[notify] push failed', error instanceof Error ? error.message : error);
        }
      }

      if (delivered) {
        return res.json({ channel: 'push', message: `Notified ${name} on their device.` });
      }
      if (deliverable && emailOn) {
        try {
          await sendNotifyMail({
            to: email,
            subject: `PUF-AM: ${copy.title}`,
            text: copy.emailText,
          });
          return res.json({ channel: 'email', message: `Emailed ${name}.` });
        } catch (error) {
          console.error('[notify] email failed', error instanceof Error ? error.message : error);
          return res.json({
            channel: 'unreachable',
            message: `Could not email ${name}.`,
          });
        }
      }
      return res.json({
        channel: 'unreachable',
        message: unreachableNotifyMessage({ name, deliverableEmail: deliverable, emailConfigured: emailOn }),
      });
    } catch (error: unknown) {
      return res.status(statusOf(error)).json({
        error: error instanceof Error ? error.message : 'Failed to notify',
      });
    }
  });
}
