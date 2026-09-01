import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkInviteClaim,
  exhaustedInviteMessage,
  inviteBindsToFirstRedeemer,
} from '../shared/auth/inviteLimits';
import { MODULE_PRESETS } from '../shared/auth/farmModules';
import { uidForPinRedeem } from '../server/accessPinCrypto';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

describe('admin invite binds to its first redeemer', () => {
  it('binds an unclaimed admin invite to the person redeeming it', () => {
    const claim = checkInviteClaim({ role: 'admin' }, 'ap_alex');
    expect(claim).toEqual({ ok: true, bind: true });
  });

  it('locks out a second person on the same admin code', () => {
    const claim = checkInviteClaim(
      { role: 'admin', claimedBy: 'ap_alex', claimedDisplayName: 'Alex' },
      'ap_mallory'
    );
    expect(claim.ok).toBe(false);
    // The name is the hint that separates "someone stole this" from "I typed
    // my own name differently".
    expect(claim.ok === false && claim.reason).toContain('Alex');
  });

  /**
   * Redeem is also the return-login path, so this is the case that would lock
   * an admin out of their own farm if binding were implemented as maxUses: 1.
   */
  it('lets the original admin keep signing in', () => {
    const uid = uidForPinRedeem('ABCD1234', 'Alex');
    const claim = checkInviteClaim({ role: 'admin', claimedBy: uid }, uid);
    expect(claim).toEqual({ ok: true, bind: false });

    // Same person, same code, name typed with different case/spacing.
    const again = checkInviteClaim(
      { role: 'admin', claimedBy: uid },
      uidForPinRedeem('abcd-1234', ' alex ')
    );
    expect(again.ok).toBe(true);
  });

  it('leaves crew invites shareable', () => {
    for (const role of ['farmer', 'viewer']) {
      expect(inviteBindsToFirstRedeemer(role)).toBe(false);
      expect(checkInviteClaim({ role, claimedBy: 'ap_alex' }, 'ap_sam')).toEqual({
        ok: true,
        bind: false,
      });
    }
  });

  /**
   * A cap here would be the lockout bug, not a fix: the admin would spend the
   * single use on their first login and never get back in.
   */
  it('keeps the admin preset uncapped', () => {
    const admin = MODULE_PRESETS.find((p) => p.id === 'admin');
    expect(admin?.role).toBe('admin');
    expect(admin?.maxUses).toBeNull();
  });

  it('explains an exhausted single-use invite', () => {
    expect(exhaustedInviteMessage({ role: 'admin', maxUses: 1 })).toContain('already been used');
    expect(exhaustedInviteMessage({ role: 'farmer', maxUses: 5 })).toBe(
      'This invite PIN has no uses left.'
    );
  });
});

describe('firestore rules back the binding on BYO projects', () => {
  it('lets a redeemer write the binding fields', () => {
    const allowlist = rules.match(/hasOnly\(\['useCount',[\s\S]*?\]\)/);
    expect(allowlist?.[0]).toContain('claimedBy');
    expect(allowlist?.[0]).toContain('claimedDisplayName');
  });

  it('refuses to let a later redeemer rebind an admin ticket', () => {
    expect(rules).toContain('joinTicketBindingHeld(resource.data, request.resource.data)');
    const helper = rules.match(/function joinTicketBindingHeld\([\s\S]*?\n {4}\}/)?.[0] ?? '';
    // Unclaimed => must stamp your own uid; already claimed => must match.
    expect(helper).toContain('next.claimedBy == request.auth.uid');
    expect(helper).toContain('next.claimedBy == prior.claimedBy');
  });

  it('validates the new fields so the ticket write is not rejected', () => {
    expect(rules).toContain("!('claimedBy' in data) || data.claimedBy == null");
  });
});
