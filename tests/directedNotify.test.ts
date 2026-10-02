import { describe, expect, it } from 'vitest';
import {
  directedNotifyCopy,
  isDeliverableMailbox,
  maySendDirectedNotify,
  nextNotifyQuota,
  NOTIFY_ADMIN_PER_HOUR,
  NOTIFY_HOUR_MS,
  NOTIFY_STAFF_PER_HOUR,
  pushSubscriptionFrom,
  unreachableNotifyMessage,
} from '../shared/notify/directedNotify';

describe('directed notify', () => {
  it('lets admins send and keeps everyone else off until allowed', () => {
    expect(maySendDirectedNotify('admin', false)).toBe(true);
    expect(maySendDirectedNotify('farmer', undefined)).toBe(false);
    expect(maySendDirectedNotify('viewer', false)).toBe(false);
    expect(maySendDirectedNotify('farmer', true)).toBe(true);
  });

  it('treats invite PIN mail as undeliverable', () => {
    expect(isDeliverableMailbox('pat@gmail.com')).toBe(true);
    expect(isDeliverableMailbox('ap_abc@sentinut.local')).toBe(false);
    expect(isDeliverableMailbox('ap_abc@byo.pufam.invalid')).toBe(false);
    expect(isDeliverableMailbox('')).toBe(false);
  });

  it('caps a farmer at eight an hour and an admin higher', () => {
    const now = 1_000_000;
    const staff = nextNotifyQuota({
      role: 'farmer',
      windowStart: now - 1_000,
      count: NOTIFY_STAFF_PER_HOUR,
      now,
    });
    expect(staff.ok).toBe(false);
    const admin = nextNotifyQuota({
      role: 'admin',
      windowStart: now - 1_000,
      count: NOTIFY_STAFF_PER_HOUR,
      now,
    });
    expect(admin.ok).toBe(true);
    expect('count' in admin && admin.count).toBe(NOTIFY_STAFF_PER_HOUR + 1);
    const reset = nextNotifyQuota({
      role: 'farmer',
      windowStart: now - NOTIFY_HOUR_MS,
      count: NOTIFY_STAFF_PER_HOUR,
      now,
    });
    expect(reset.ok).toBe(true);
    expect('count' in reset && reset.count).toBe(1);
    expect(NOTIFY_ADMIN_PER_HOUR).toBeGreaterThan(NOTIFY_STAFF_PER_HOUR);
  });

  it('explains a PIN account with no device', () => {
    expect(
      unreachableNotifyMessage({
        name: 'Pat',
        deliverableEmail: false,
        emailConfigured: true,
      })
    ).toMatch(/invite PIN/i);
    const copy = directedNotifyCopy({
      senderName: 'George',
      note: 'Check this valve',
      kind: 'highlight',
      appUrl: 'https://am.pufworks.farm/',
    });
    expect(copy.title).toBe('Check this');
    expect(copy.body).toContain('George');
    expect(copy.emailText).toContain('https://am.pufworks.farm/map');
  });

  it('accepts a browser push subscription and rejects a bare token', () => {
    expect(
      pushSubscriptionFrom({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'B'.repeat(40), auth: 'a'.repeat(16) },
      })?.endpoint
    ).toContain('https://');
    expect(pushSubscriptionFrom({ token: 'abc' })).toBeNull();
  });
});
