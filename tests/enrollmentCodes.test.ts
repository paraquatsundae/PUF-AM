/**
 * The gate on `POST /api/auth/create-farm` (Plans/FIREBASE_BILLING.md §5.1).
 * The Firestore reservation is exercised against the live server; what lives
 * here is the part that decides whether a typed code matches an issued one —
 * codes are read over the phone, so matching has to be forgiving without
 * being loose.
 */

import { describe, expect, it } from 'vitest';

import { normalizeEnrollmentCode, parseEnrollmentCodes } from '../server/enrollmentCodes.ts';

describe('normalizeEnrollmentCode', () => {
  it('ignores case, spaces and the dashes people add for readability', () => {
    expect(normalizeEnrollmentCode('ab2cd-ef3gh')).toBe('AB2CDEF3GH');
    expect(normalizeEnrollmentCode(' AB2CD EF3GH ')).toBe('AB2CDEF3GH');
    expect(normalizeEnrollmentCode('AB2CDEF3GH')).toBe('AB2CDEF3GH');
  });

  it('does not forgive actual typos', () => {
    expect(normalizeEnrollmentCode('AB2CD-EF3GX')).not.toBe('AB2CDEF3GH');
  });
});

describe('parseEnrollmentCodes', () => {
  it('splits the env-var form and normalizes each entry', () => {
    expect(parseEnrollmentCodes('ab2cd-ef3gh, JK4MN-PQ5RS')).toEqual([
      'AB2CDEF3GH',
      'JK4MNPQ5RS',
    ]);
  });

  it('drops blanks and codes too short to have been issued', () => {
    expect(parseEnrollmentCodes(',, abc ,')).toEqual([]);
    expect(parseEnrollmentCodes('')).toEqual([]);
  });
});
