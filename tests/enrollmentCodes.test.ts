/**
 * The gate on `POST /api/auth/create-farm` (Plans/FIREBASE_BILLING.md §5.1).
 * The Firestore reservation is exercised against the live server; what lives
 * here is the part that decides whether a typed code matches an issued one —
 * codes are read over the phone, so matching has to be forgiving without
 * being loose.
 */

import { describe, expect, it } from 'vitest';

import {
  enrollmentCodeHash,
  formatEnrollmentCode,
  mayMintEnrollmentCode,
  normalizeEnrollmentCode,
  parseEnrollmentCodes,
  unusedEnrollmentCount,
} from '../server/enrollmentCodes.ts';

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

describe('mayMintEnrollmentCode', () => {
  it('lets a platform admin mint', () => {
    expect(
      mayMintEnrollmentCode({
        platformAdmin: true,
        pinAuth: false,
        email: 'george@pufworks.farm',
        anyPlatformAdmin: true,
      }).ok
    ).toBe(true);
  });

  it('lets the first Google admin mint when the project has no platform admin yet', () => {
    const decision = mayMintEnrollmentCode({
      platformAdmin: false,
      pinAuth: false,
      email: 'george@pufworks.farm',
      anyPlatformAdmin: false,
    });
    expect(decision).toMatchObject({ ok: true, bootstrap: true });
  });

  it('refuses everyone else once a platform admin exists', () => {
    expect(
      mayMintEnrollmentCode({
        platformAdmin: false,
        pinAuth: false,
        email: 'someone@example.com',
        anyPlatformAdmin: true,
      })
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a PIN identity', () => {
    expect(
      mayMintEnrollmentCode({
        platformAdmin: false,
        pinAuth: true,
        email: 'ap_abc@sentinut.local',
        anyPlatformAdmin: false,
      }).ok
    ).toBe(false);
  });
});

describe('formatEnrollmentCode', () => {
  it('groups a code so it can be read aloud, without changing what is stored', () => {
    expect(formatEnrollmentCode('ab2cdef3gh')).toBe('AB2CD-EF3GH');
    expect(normalizeEnrollmentCode(formatEnrollmentCode('ab2cdef3gh'))).toBe('AB2CDEF3GH');
    expect(enrollmentCodeHash(normalizeEnrollmentCode('AB2CD-EF3GH'))).toBe(
      enrollmentCodeHash('AB2CDEF3GH')
    );
  });
});

describe('unusedEnrollmentCount', () => {
  it('counts configured codes whose hash is not in the used set', () => {
    const codes = parseEnrollmentCodes('AB2CD-EF3GH, JK4MN-PQ5RS');
    expect(unusedEnrollmentCount(codes, [])).toBe(2);
    expect(unusedEnrollmentCount(codes, [enrollmentCodeHash(codes[0])])).toBe(1);
    expect(unusedEnrollmentCount(codes, codes.map((code) => enrollmentCodeHash(code)))).toBe(0);
  });
});
