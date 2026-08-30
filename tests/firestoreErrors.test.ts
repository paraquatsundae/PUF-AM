import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({
  auth: { currentUser: null },
}));

import { isBenignFirestoreFailure } from '../src/lib/firestoreErrors';

describe('isBenignFirestoreFailure', () => {
  it('treats permission and offline codes as soft', () => {
    expect(isBenignFirestoreFailure({ code: 'permission-denied', message: 'no' })).toBe(true);
    expect(isBenignFirestoreFailure({ code: 'unauthenticated' })).toBe(true);
    expect(isBenignFirestoreFailure({ code: 'failed-precondition' })).toBe(true);
    expect(isBenignFirestoreFailure(new Error('the client is offline'))).toBe(true);
    expect(isBenignFirestoreFailure(new Error('Missing or insufficient permissions'))).toBe(true);
    expect(isBenignFirestoreFailure(new Error('INTERNAL ASSERTION FAILED'))).toBe(true);
  });

  it('does not swallow unrelated errors', () => {
    expect(isBenignFirestoreFailure(new Error('quota exceeded'))).toBe(false);
    expect(isBenignFirestoreFailure({ code: 'unavailable', message: 'try later' })).toBe(false);
  });
});
