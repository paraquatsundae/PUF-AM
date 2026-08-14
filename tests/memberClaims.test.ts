import { describe, expect, it } from 'vitest';

import { claimsForMember, resolvePlatformAdminClaim } from '../server/memberClaims.ts';

describe('resolvePlatformAdminClaim', () => {
  it('is false for farm-role admin claims', () => {
    expect(
      resolvePlatformAdminClaim({
        admin: true,
        pinAuth: true,
        role: 'admin',
        farmId: 'farm_1',
      })
    ).toBe(false);
    expect(
      resolvePlatformAdminClaim({
        admin: true,
        pinAuth: false,
        role: 'admin',
        farmId: 'farm_1',
      })
    ).toBe(false);
  });

  it('is true for the old setAdminClaim shape { admin: true }', () => {
    expect(resolvePlatformAdminClaim({ admin: true })).toBe(true);
  });

  it('is true when platformAdmin is already set', () => {
    expect(
      resolvePlatformAdminClaim({
        platformAdmin: true,
        admin: true,
        role: 'admin',
        farmId: 'farm_1',
      })
    ).toBe(true);
  });
});

describe('claimsForMember', () => {
  const base = {
    farmId: 'farm_1',
    role: 'admin',
    modules: ['dashboard'],
    authEpoch: 1,
  };

  it('does not grant platform admin from farm role', () => {
    const claims = claimsForMember(base);
    expect(claims.admin).toBe(false);
    expect(claims.platformAdmin).toBe(false);
    expect(claims.role).toBe('admin');
    expect(claims.farmId).toBe('farm_1');
  });

  it('preserves a platform admin across a farm-claim rewrite', () => {
    const claims = claimsForMember(base, { platformAdmin: true, admin: true });
    expect(claims.platformAdmin).toBe(true);
    expect(claims.admin).toBe(true);
  });
});
