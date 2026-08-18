import { describe, expect, it } from 'vitest';

import { isPlatformAdminClaims } from '../src/lib/adminAuth.ts';

describe('isPlatformAdminClaims', () => {
  it('rejects farm-role admin tokens', () => {
    expect(
      isPlatformAdminClaims({ admin: true, pinAuth: true, role: 'admin', farmId: 'farm_1' })
    ).toBe(false);
    expect(isPlatformAdminClaims({ admin: true, role: 'admin', farmId: 'farm_1' })).toBe(false);
  });

  it('accepts the old setAdminClaim shape and the new platformAdmin flag', () => {
    expect(isPlatformAdminClaims({ admin: true })).toBe(true);
    expect(isPlatformAdminClaims({ platformAdmin: true, role: 'admin', farmId: 'farm_1' })).toBe(
      true
    );
  });
});
