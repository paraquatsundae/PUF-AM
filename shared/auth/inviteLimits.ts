/**
 * Exclusivity for generated invite PINs.
 *
 * An admin invite mints a full-privilege account, and the redeem uid is derived
 * from PIN + display name (`uidForPinRedeem`), so a second person entering the
 * same admin code under a different name does not collide with the first —
 * they quietly become a second, separate admin. One leaked admin code was an
 * unbounded supply of admins for as long as the PIN lived.
 *
 * The fix is to bind the PIN to whoever redeems it first rather than to cap
 * `maxUses` at 1. Redeem is also the return-login path (`redeem-pin` updates an
 * existing user and preserves their authEpoch), so a hard one-use cap would let
 * an admin sign in exactly once and then lock them out of their own farm.
 * Binding gives the property that matters — nobody *else* can use the code —
 * while the original redeemer keeps signing in.
 *
 * The owner recovery PIN is exempt: it is minted on the create-farm path and
 * stays unbound and unlimited because it is the only way back in after losing
 * a device.
 */

/** Roles whose invite is consumed by the first person to redeem it. */
export function inviteBindsToFirstRedeemer(role: string | null | undefined): boolean {
  return role === 'admin';
}

export type InviteClaimRecord = {
  role?: string | null;
  claimedBy?: string | null;
  claimedDisplayName?: string | null;
};

export type InviteClaimCheck =
  | { ok: true; bind: boolean }
  | { ok: false; reason: string };

/**
 * Decide whether `uid` may redeem this invite.
 *
 * `bind: true` means the caller must persist `claimedBy`/`claimedDisplayName`
 * in the same atomic write that claims the use, or the binding races.
 */
export function checkInviteClaim(
  record: InviteClaimRecord,
  uid: string
): InviteClaimCheck {
  if (!inviteBindsToFirstRedeemer(record.role)) return { ok: true, bind: false };
  const claimedBy = record.claimedBy;
  if (!claimedBy) return { ok: true, bind: true };
  if (claimedBy === uid) return { ok: true, bind: false };
  return { ok: false, reason: adminInviteClaimedMessage(record.claimedDisplayName) };
}

export function adminInviteClaimedMessage(claimedDisplayName?: string | null): string {
  const who = claimedDisplayName?.trim();
  // The uid is derived from PIN + name, so the same person typing a different
  // name reads as a different identity. Say so rather than a flat refusal.
  return who
    ? `This admin invite has already been used by ${who}. If that is you, enter your name exactly as you did then. Otherwise ask the farm owner for a new invite.`
    : 'This admin invite has already been used. Ask the farm owner for a new invite.';
}

/**
 * Staff invites start here: one slot for a phone, one for a tablet, one for a
 * computer. Signing in again on a device that already took a slot does not
 * take another. Admin invites stay uncapped — see the note at the top.
 */
export const STAFF_INVITE_DEVICE_CAP = 3;

/** Stable id for one account on one browser. A missing agent shares one slot. */
export function deviceSlotKey(uid: string, userAgent: string | null | undefined): string {
  const agent = (userAgent || '').trim() || 'unknown-device';
  return `${uid}|${agent}`;
}

/**
 * Uncapped invites still count every sign-in, which is what the admin tests
 * lock in. A capped invite spends a slot only for a browser this account has
 * not used on this PIN before.
 */
export function redeemConsumesDeviceSlot(
  record: { maxUses: number | null; deviceKeys?: readonly string[] | null },
  uid: string,
  userAgent: string | null | undefined
): boolean {
  if (record.maxUses == null) return true;
  const keys = Array.isArray(record.deviceKeys) ? record.deviceKeys : [];
  return !keys.includes(deviceSlotKey(uid, userAgent));
}

export function inviteStillOpen(
  record: {
    active: boolean;
    expiresAt?: string | null;
    maxUses: number | null;
    useCount: number;
    role?: string | null;
  },
  consumesSlot: boolean,
  now = new Date()
): { ok: true } | { ok: false; reason: string } {
  if (!record.active) return { ok: false, reason: 'This invite PIN has been revoked.' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() < now.getTime()) {
    return { ok: false, reason: 'This invite PIN has expired.' };
  }
  if (consumesSlot && record.maxUses != null && record.useCount >= record.maxUses) {
    return { ok: false, reason: exhaustedInviteMessage(record) };
  }
  return { ok: true };
}

/**
 * A replacement PIN can be held for the person who used up the previous one.
 * The same name reopens that account. A different name does not.
 */
export function resolveHeldInviteUid(
  record: { heldForUid?: string | null; heldForDisplayName?: string | null },
  displayName: string,
  uidFromPin: string
): { ok: true; uid: string } | { ok: false; reason: string } {
  const holder = record.heldForUid;
  if (!holder) return { ok: true, uid: uidFromPin };
  const expected = (record.heldForDisplayName || '').trim().toLowerCase();
  if (expected && displayName.trim().toLowerCase() === expected) {
    return { ok: true, uid: holder };
  }
  const who = record.heldForDisplayName?.trim();
  return {
    ok: false,
    reason: who
      ? `This PIN was issued for ${who}. Enter that name, or ask the farm admin for your own invite.`
      : 'This PIN was issued for someone else. Ask the farm admin for your own invite.',
  };
}

/** Message for a PIN that has run out of uses. */
export function exhaustedInviteMessage(record: {
  role?: string | null;
  maxUses: number | null;
}): string {
  if (record.maxUses !== 1) {
    return 'This invite PIN has no device uses left. Ask a farm admin to add uses or issue a linked PIN.';
  }
  return record.role === 'admin'
    ? 'This admin invite has already been used. Ask the farm owner for a new invite.'
    : 'This invite PIN has already been used. Ask for a new one.';
}
