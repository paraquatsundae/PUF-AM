import { describe, expect, it, vi, beforeEach } from 'vitest';

const userGet = vi.fn();
const userSet = vi.fn();
const publicDelete = vi.fn();
const setCustomUserClaims = vi.fn();
const revokeRefreshTokens = vi.fn();
const updateUser = vi.fn();
const getUser = vi.fn();

vi.mock('../../server/firebaseAdmin.ts', () => ({
  getAdminAuth: () => ({
    setCustomUserClaims,
    revokeRefreshTokens,
    updateUser,
    getUser,
  }),
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: () => ({
        get: userGet,
        set: userSet,
        delete: name === 'users_public' ? publicDelete : vi.fn(),
      }),
    }),
  }),
}));

const { removeDirectoryUser } = await import('../../server/removeDirectoryUser.ts');

describe('removeDirectoryUser', () => {
  beforeEach(() => {
    userGet.mockReset();
    userSet.mockReset();
    publicDelete.mockReset();
    setCustomUserClaims.mockReset();
    revokeRefreshTokens.mockReset();
    updateUser.mockReset();
    getUser.mockReset();
    userGet.mockResolvedValue({
      exists: true,
      data: () => ({ authEpoch: 2, role: 'farmer', farmId: 'farm_1' }),
    });
    getUser.mockResolvedValue({ customClaims: { pinAuth: true, farmId: 'farm_1' } });
    setCustomUserClaims.mockResolvedValue(undefined);
    revokeRefreshTokens.mockResolvedValue(undefined);
    updateUser.mockResolvedValue(undefined);
    userSet.mockResolvedValue(undefined);
    publicDelete.mockResolvedValue(undefined);
  });

  it('stamps the profile revoked, then kills refresh tokens and disables the account', async () => {
    await removeDirectoryUser('ap_9');

    expect(userSet).toHaveBeenCalledWith(
      expect.objectContaining({
        accessRevoked: true,
        farmId: null,
        authEpoch: 3,
        modules: [],
      }),
      { merge: true }
    );
    expect(setCustomUserClaims).toHaveBeenCalledWith(
      'ap_9',
      expect.objectContaining({ accessRevoked: true, admin: false, platformAdmin: false, authEpoch: 3 })
    );
    expect(revokeRefreshTokens).toHaveBeenCalledWith('ap_9');
    expect(updateUser).toHaveBeenCalledWith('ap_9', { disabled: true });
    expect(publicDelete).toHaveBeenCalled();
  });

  it('still revokes when the Auth user is already gone', async () => {
    const missing = Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    setCustomUserClaims.mockRejectedValue(missing);
    revokeRefreshTokens.mockRejectedValue(missing);
    updateUser.mockRejectedValue(missing);

    await expect(removeDirectoryUser('gone')).resolves.toBeUndefined();
    expect(userSet).toHaveBeenCalled();
  });
});
