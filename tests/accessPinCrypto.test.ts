import { describe, expect, it } from 'vitest';
import {
  canRedeemPin,
  generatePinCode,
  hashPin,
  normalizePin,
  pinDocId,
  uidForPinRedeem,
} from '../server/accessPinCrypto';

describe('accessPinCrypto', () => {
  it('normalizes and hashes pins stably', () => {
    expect(normalizePin('ab-cd 12')).toBe('ABCD12');
    expect(hashPin('abcd12')).toBe(hashPin('AB-CD-12'));
    expect(pinDocId('TESTPIN1')).toHaveLength(64);
  });

  it('maps same pin+name to same uid', () => {
    const a = uidForPinRedeem('ABCD1234', 'Alex');
    const b = uidForPinRedeem('abcd-1234', ' alex ');
    expect(a).toBe(b);
    expect(a.startsWith('ap_')).toBe(true);
  });

  it('generates unambiguous codes', () => {
    const code = generatePinCode(8);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it('enforces redeem limits', () => {
    const base = {
      farmId: 'farm_x',
      role: 'farmer' as const,
      label: 't',
      active: true,
      maxUses: 1,
      useCount: 1,
      expiresAt: null,
      createdBy: 'x',
      createdAt: new Date().toISOString(),
    };
    expect(canRedeemPin(base).ok).toBe(false);
    expect(canRedeemPin({ ...base, useCount: 0 }).ok).toBe(true);
    expect(canRedeemPin({ ...base, useCount: 0, active: false }).ok).toBe(false);
  });
});
