import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/firebase.ts` builds a real Firebase app at import time — auth
 * persistence, Capacitor, the lot — so it is stubbed rather than loaded. The
 * subject here is `getFarmAssets`'s error contract, which needs no live SDK.
 */
vi.mock('../firebase', () => ({ db: {} }));

const getDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (...path: unknown[]) => path,
  getDoc: (...args: unknown[]) => getDoc(...args),
  setDoc: vi.fn(),
}));

const { getFarmAssets } = await import('./farmAssets');

describe('getFarmAssets', () => {
  beforeEach(() => {
    getDoc.mockReset();
  });

  it('reads the dryer list when the doc exists', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ dryers: [{ id: 'd1', name: 'Bin A' }] }),
    });
    await expect(getFarmAssets('farm1')).resolves.toEqual({
      dryers: [{ id: 'd1', name: 'Bin A' }],
    });
  });

  it('treats a missing doc as an empty list, not a failure', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    await expect(getFarmAssets('farm1')).resolves.toEqual({ dryers: [] });
  });

  it('tolerates a doc whose dryers field is not an array', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ dryers: 'nope' }) });
    await expect(getFarmAssets('farm1')).resolves.toEqual({ dryers: [] });
  });

  /**
   * The one that matters. This used to be caught and flattened to `{ dryers: [] }`,
   * which made a failed read look exactly like a farm with no dryers — and
   * `FarmDryersPanel` would then save that empty list back over the real one.
   * If someone reinstates the `try`/`catch` for tidiness, this fails.
   */
  it('rejects when the read fails, rather than reporting no dryers', async () => {
    getDoc.mockRejectedValue(new Error('permission-denied'));
    await expect(getFarmAssets('farm1')).rejects.toThrow('permission-denied');
  });
});
