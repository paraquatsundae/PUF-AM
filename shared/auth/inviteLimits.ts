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

/** Message for a PIN that has run out of uses. */
export function exhaustedInviteMessage(record: {
  role?: string | null;
  maxUses: number | null;
}): string {
  if (record.maxUses !== 1) return 'This invite PIN has no uses left.';
  return record.role === 'admin'
    ? 'This admin invite has already been used. Ask the farm owner for a new invite.'
    : 'This invite PIN has already been used. Ask for a new one.';
}
