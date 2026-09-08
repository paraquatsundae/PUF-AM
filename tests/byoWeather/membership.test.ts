import { describe, expect, it } from 'vitest';

import { membershipAllowsAccess } from '../../functions-byo-weather/src/membership';

describe('BYO weather membership', () => {
  it('accepts a farm claim or a stored farmId', () => {
    expect(membershipAllowsAccess({ uid: 'u', farmId: 'farm-1' }, null)).toBe(true);
    expect(membershipAllowsAccess({ uid: 'u' }, { farmId: 'farm-1' })).toBe(true);
  });

  it('rejects a signed-in stranger with no farm', () => {
    expect(membershipAllowsAccess({ uid: 'stranger' }, null)).toBe(false);
    expect(membershipAllowsAccess({ uid: 'stranger' }, {})).toBe(false);
  });

  it('rejects a revoked or stale-epoch account even with a farm claim', () => {
    expect(
      membershipAllowsAccess({ uid: 'u', farmId: 'farm-1' }, { farmId: 'farm-1', accessRevoked: true })
    ).toBe(false);
    expect(
      membershipAllowsAccess(
        { uid: 'u', farmId: 'farm-1', authEpoch: 1 },
        { farmId: 'farm-1', authEpoch: 2 }
      )
    ).toBe(false);
  });
});
