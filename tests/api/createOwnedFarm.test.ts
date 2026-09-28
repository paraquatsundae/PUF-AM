/**
 * Google sign-in creates a farm on that uid, not a second PIN identity.
 * Enrollment stays the gate (Plans/FIREBASE_BILLING.md §5.1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const setCustomUserClaims = vi.fn();
const docs = new Map<string, Record<string, unknown>>();

function docRef(path: string) {
  return {
    get: async () => ({
      exists: docs.has(path),
      data: () => docs.get(path),
    }),
    set: async (data: Record<string, unknown>) => {
      docs.set(path, { ...(docs.get(path) || {}), ...data });
    },
    collection: (name: string) => collection(`${path}/${name}`),
  };
}

function collection(path: string) {
  return { doc: (id: string) => docRef(`${path}/${id}`) };
}

const reserveEnrollmentCode = vi.fn();
const releaseEnrollmentCode = vi.fn();
const markEnrollmentCodeUsed = vi.fn();

vi.mock('../../server/firebaseAdmin.ts', () => ({
  getAdminAuth: () => ({ getUser, setCustomUserClaims }),
  getAdminDb: () => ({ collection }),
  isAdminSdkReady: () => true,
}));

vi.mock('../../server/enrollmentCodes.ts', () => ({
  reserveEnrollmentCode: (...args: unknown[]) => reserveEnrollmentCode(...args),
  releaseEnrollmentCode: (...args: unknown[]) => releaseEnrollmentCode(...args),
  markEnrollmentCodeUsed: (...args: unknown[]) => markEnrollmentCodeUsed(...args),
}));

const { createOwnedFarmForCaller } = await import('../../server/createOwnedFarm.ts');

describe('createOwnedFarmForCaller', () => {
  beforeEach(() => {
    docs.clear();
    getUser.mockReset();
    setCustomUserClaims.mockReset();
    reserveEnrollmentCode.mockReset();
    releaseEnrollmentCode.mockReset();
    markEnrollmentCodeUsed.mockReset();
    getUser.mockResolvedValue({ email: 'george@pufworks.farm', customClaims: {} });
    setCustomUserClaims.mockResolvedValue(undefined);
    reserveEnrollmentCode.mockResolvedValue({ ok: true, codeHash: 'hash-1' });
    releaseEnrollmentCode.mockResolvedValue(undefined);
    markEnrollmentCodeUsed.mockResolvedValue(undefined);
  });

  it('makes the Google uid the owner and a farm admin, without a PIN session', async () => {
    const result = await createOwnedFarmForCaller({
      uid: 'google-uid',
      farmName: 'Clare Downs',
      displayName: 'George',
      enrollmentCode: 'ENROLL1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.role).toBe('admin');
    expect(result.recoveryPin).toMatch(/^[A-Z0-9]{8}$/);

    const farm = [...docs.entries()].find(([path]) => path.split('/').length === 2 && path.startsWith('farms/'));
    expect(farm?.[1]).toMatchObject({
      name: 'Clare Downs',
      ownerUid: 'google-uid',
    });
    expect(docs.get('users/google-uid')).toMatchObject({
      uid: 'google-uid',
      email: 'george@pufworks.farm',
      role: 'admin',
      farmId: result.farmId,
      authMethod: 'google',
      hasAgreedToTerms: true,
    });
    expect(setCustomUserClaims).toHaveBeenCalledWith(
      'google-uid',
      expect.objectContaining({
        pinAuth: false,
        role: 'admin',
        farmId: result.farmId,
        admin: false,
        platformAdmin: false,
      })
    );
    expect(markEnrollmentCodeUsed).toHaveBeenCalledWith('hash-1', {
      farmId: result.farmId,
      farmName: 'Clare Downs',
    });
  });

  it('keeps an existing platform-admin claim', async () => {
    getUser.mockResolvedValue({
      email: 'george@pufworks.farm',
      customClaims: { admin: true },
    });

    const result = await createOwnedFarmForCaller({
      uid: 'google-uid',
      farmName: 'Clare Downs',
      displayName: 'George',
      enrollmentCode: 'ENROLL1',
    });

    expect(result.ok).toBe(true);
    expect(setCustomUserClaims).toHaveBeenCalledWith(
      'google-uid',
      expect.objectContaining({ platformAdmin: true, admin: true, pinAuth: false, role: 'admin' })
    );
  });

  it('refuses an account that already has a farm and does not spend the code', async () => {
    docs.set('users/google-uid', { farmId: 'farm_existing' });

    const result = await createOwnedFarmForCaller({
      uid: 'google-uid',
      farmName: 'Clare Downs',
      displayName: 'George',
      enrollmentCode: 'ENROLL1',
    });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(reserveEnrollmentCode).not.toHaveBeenCalled();
  });

  it('returns the enrollment refusal and does not write a farm', async () => {
    reserveEnrollmentCode.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Creating a cloud farm needs an enrollment code from whoever runs this server.',
    });

    const result = await createOwnedFarmForCaller({
      uid: 'google-uid',
      farmName: 'Clare Downs',
      displayName: 'George',
      enrollmentCode: 'NOPE',
    });

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      error: 'Creating a cloud farm needs an enrollment code from whoever runs this server.',
    });
    expect(docs.size).toBe(0);
  });

  it('gives the code back when the farm write fails', async () => {
    setCustomUserClaims.mockRejectedValue(new Error('claims down'));

    const result = await createOwnedFarmForCaller({
      uid: 'google-uid',
      farmName: 'Clare Downs',
      displayName: 'George',
      enrollmentCode: 'ENROLL1',
    });

    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(releaseEnrollmentCode).toHaveBeenCalledWith('hash-1');
    expect(markEnrollmentCodeUsed).not.toHaveBeenCalled();
  });
});
