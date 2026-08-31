/**
 * `verifyBearer` used to trust the claims on the ID token alone.
 *
 * `remove-member` bumps `authEpoch` and calls `revokeRefreshTokens`, which stops
 * the *next* token but not the one already in the browser — that stays valid for
 * up to an hour carrying the old `farmId` and `role`. So the stored user record
 * has to be the authority on current access, not the claims cache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyIdToken = vi.fn();
const userDocGet = vi.fn();

vi.mock('../../server/firebaseAdmin.ts', () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminDb: () => ({
    collection: () => ({ doc: () => ({ get: userDocGet }) }),
  }),
  getAdminFieldValue: () => ({ increment: (n: number) => n }),
  isAdminSdkReady: () => true,
}));

const { verifyBearer } = await import('../../server/accessPinAuth.ts');

const request = { headers: { authorization: 'Bearer token' } } as never;

function storedUser(data: Record<string, unknown> | null) {
  userDocGet.mockResolvedValue({
    exists: data !== null,
    data: () => data,
  });
}

describe('verifyBearer revocation', () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    userDocGet.mockReset();
  });

  it('refuses a member whose access was revoked, even on a still-valid token', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'ap_1',
      farmId: 'farm_1',
      role: 'farmer',
      authEpoch: 3,
    });
    storedUser({ role: 'farmer', authEpoch: 3, accessRevoked: true });

    await expect(verifyBearer(request)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('refuses a token minted before the stored epoch moved on', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'ap_1',
      farmId: 'farm_1',
      role: 'admin',
      authEpoch: 2,
    });
    storedUser({ role: 'farmer', authEpoch: 5, accessRevoked: false });

    await expect(verifyBearer(request)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('accepts a member whose epoch still matches', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'ap_1',
      farmId: 'farm_1',
      role: 'farmer',
      authEpoch: 4,
    });
    storedUser({ role: 'farmer', authEpoch: 4, accessRevoked: false });

    await expect(verifyBearer(request)).resolves.toMatchObject({
      uid: 'ap_1',
      farmId: 'farm_1',
      role: 'farmer',
      admin: false,
    });
  });

  /**
   * Platform admins sign in with Google and are not minted through
   * `claimsForMember`, so their token carries no `authEpoch`. Treating absent as
   * stale would lock the admin console out of its own server.
   */
  it('does not treat a missing token epoch as a stale one', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'admin_1', platformAdmin: true });
    storedUser({ role: 'admin', authEpoch: 7 });

    await expect(verifyBearer(request)).resolves.toMatchObject({
      uid: 'admin_1',
      admin: true,
    });
  });

  it('still resolves farm-admin from the stored record when the claim is absent', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'ap_2', farmId: 'farm_1', authEpoch: 1 });
    storedUser({ role: 'admin', authEpoch: 1 });

    await expect(verifyBearer(request)).resolves.toMatchObject({ admin: true });
  });

  it('does not reject a caller with no stored user record', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'new_1', platformAdmin: true });
    storedUser(null);

    await expect(verifyBearer(request)).resolves.toMatchObject({ uid: 'new_1' });
  });
});
