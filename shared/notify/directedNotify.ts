/**
 * Directed highlight / issue alerts.
 *
 * Push when the person has a device token. Email only when they have a real
 * mailbox and push did not land. Invite PIN accounts (`@sentinut.local`,
 * bring-your-own synthetic mail) have no inbox.
 *
 * Farm admins may send. Everyone else is off until an admin sets
 * `users/{uid}.canSendNotifications`. A permitted farmer is capped per hour
 * so one casual worker cannot wake the whole crew.
 *
 * @see Plans/FARM_MESSAGING.md Decision 2026-09-30
 */

import { BYO_AUTH_EMAIL_DOMAIN } from '../auth/byoPin.ts';

export const NOTIFY_STAFF_PER_HOUR = 8;
export const NOTIFY_ADMIN_PER_HOUR = 40;
export const NOTIFY_HOUR_MS = 60 * 60 * 1000;
export const NOTIFY_DEVICE_CAP = 8;

const SYNTHETIC_EMAIL_SUFFIXES = ['@sentinut.local', `@${BYO_AUTH_EMAIL_DOMAIN}`];

export function maySendDirectedNotify(
  role: string | undefined,
  allowed: boolean | undefined
): boolean {
  if (role === 'admin') return true;
  return allowed === true;
}

export function isDeliverableMailbox(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const value = email.trim().toLowerCase();
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) return false;
  return !SYNTHETIC_EMAIL_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

export function isPlausiblePushToken(token: string): boolean {
  return token.length >= 20 && token.length <= 4096 && !/\s/.test(token);
}

export function nextNotifyQuota(input: {
  role: string | undefined;
  windowStart: number;
  count: number;
  now: number;
}): { ok: true; windowStart: number; count: number } | { ok: false; retryAfterMs: number } {
  const cap = input.role === 'admin' ? NOTIFY_ADMIN_PER_HOUR : NOTIFY_STAFF_PER_HOUR;
  const fresh = !input.windowStart || input.now - input.windowStart >= NOTIFY_HOUR_MS;
  const windowStart = fresh ? input.now : input.windowStart;
  const count = fresh ? 0 : input.count;
  if (count >= cap) {
    return { ok: false, retryAfterMs: Math.max(1_000, NOTIFY_HOUR_MS - (input.now - windowStart)) };
  }
  return { ok: true, windowStart, count: count + 1 };
}

export function directedNotifyCopy(input: {
  senderName: string;
  note: string;
  kind: 'highlight' | 'issue';
  appUrl: string;
}): { title: string; body: string; emailText: string } {
  const sender = (input.senderName || 'Someone on the farm').trim().slice(0, 80);
  const note = input.note.replace(/\s+/g, ' ').trim().slice(0, 140);
  const title = input.kind === 'issue' ? 'Farm issue' : 'Check this';
  const body = (note ? `${sender}: ${note}` : `${sender} sent you something to check on the map.`).slice(
    0,
    180
  );
  const link = `${input.appUrl.replace(/\/$/, '')}/map`;
  return {
    title,
    body,
    emailText: `${body}\n\nOpen the map: ${link}\n`,
  };
}

export function unreachableNotifyMessage(input: {
  name: string;
  deliverableEmail: boolean;
  emailConfigured: boolean;
}): string {
  const name = input.name.trim() || 'They';
  if (!input.deliverableEmail) {
    return `${name} has not allowed notifications on a device yet. An invite PIN account has no email to fall back on.`;
  }
  if (!input.emailConfigured) {
    return `${name} has not allowed notifications on a device, and email is not set up on this server.`;
  }
  return `${name} could not be notified.`;
}
