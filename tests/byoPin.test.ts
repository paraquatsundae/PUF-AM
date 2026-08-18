import { describe, expect, it } from 'vitest';

import { hashPin as nodeHashPin, normalizePin as nodeNormalize } from '../server/accessPinCrypto';
import {
  BYO_AUTH_EMAIL_DOMAIN,
  byoAuthCredentials,
  canRedeemJoinTicket,
  generatePinCode,
  hashPin,
  isByoAuthEmail,
  normalizePin,
} from '../shared/auth/byoPin';

describe('byoPin', () => {
  it('matches the server SHA-256 of a normalized PIN', async () => {
    expect(normalizePin('ab-cd 12')).toBe(nodeNormalize('ab-cd 12'));
    expect(await hashPin('ab-cd 12')).toBe(nodeHashPin('ab-cd 12'));
  });

  it('derives a stable email+password from PIN and name', async () => {
    const a = await byoAuthCredentials('ABCD1234', 'Alex');
    const b = await byoAuthCredentials('abcd-1234', ' alex ');
    expect(a).toEqual(b);
    expect(a.email).toMatch(new RegExp(`^ap_[a-f0-9]{20}@${BYO_AUTH_EMAIL_DOMAIN}$`));
    expect(a.password.startsWith('pufam-byo-v1.')).toBe(true);
    expect(isByoAuthEmail(a.email)).toBe(true);
  });

  it('mints unambiguous codes', () => {
    const code = generatePinCode(8);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it('enforces redeem limits', () => {
    const base = { active: true, maxUses: 1, useCount: 1, expiresAt: null };
    expect(canRedeemJoinTicket(base).ok).toBe(false);
    expect(canRedeemJoinTicket({ ...base, useCount: 0 }).ok).toBe(true);
    expect(canRedeemJoinTicket({ ...base, useCount: 0, active: false }).ok).toBe(false);
  });
});
