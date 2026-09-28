import { describe, expect, it } from 'vitest';
import {
  deviceSlotKey,
  inviteStillOpen,
  redeemConsumesDeviceSlot,
  resolveHeldInviteUid,
} from '../shared/auth/inviteLimits';

const open = {
  active: true,
  expiresAt: null,
  maxUses: 3,
  useCount: 3,
  role: 'farmer',
};

describe('staff invite device slots', () => {
  it('spends a slot for a new browser and not for a return on the same one', () => {
    const phone = deviceSlotKey('ap_sam', 'PhoneBrowser');
    expect(redeemConsumesDeviceSlot({ maxUses: 3, deviceKeys: [] }, 'ap_sam', 'PhoneBrowser')).toBe(
      true
    );
    expect(
      redeemConsumesDeviceSlot({ maxUses: 3, deviceKeys: [phone] }, 'ap_sam', 'PhoneBrowser')
    ).toBe(false);
    expect(
      redeemConsumesDeviceSlot({ maxUses: 3, deviceKeys: [phone] }, 'ap_sam', 'LaptopBrowser')
    ).toBe(true);
  });

  it('still counts every sign-in when the PIN is uncapped', () => {
    expect(
      redeemConsumesDeviceSlot(
        { maxUses: null, deviceKeys: [deviceSlotKey('ap_sam', 'PhoneBrowser')] },
        'ap_sam',
        'PhoneBrowser'
      )
    ).toBe(true);
  });

  it('lets a known device back in after the cap and refuses a new one', () => {
    expect(inviteStillOpen(open, false).ok).toBe(true);
    const blocked = inviteStillOpen(open, true);
    expect('reason' in blocked && blocked.reason).toContain('linked PIN');
  });

  it('reopens the held account only for the same name', () => {
    const held = { heldForUid: 'ap_sam', heldForDisplayName: 'Sam' };
    expect(resolveHeldInviteUid(held, ' sam ', 'ap_other')).toEqual({ ok: true, uid: 'ap_sam' });
    const refused = resolveHeldInviteUid(held, 'Alex', 'ap_alex');
    expect('reason' in refused && refused.reason).toContain('Sam');
  });
});
