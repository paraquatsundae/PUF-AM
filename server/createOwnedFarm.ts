/**
 * A Google account on this project creates its own cloud farm.
 *
 * The logged-out `POST /api/auth/create-farm` mints a PIN user. That is the
 * wrong identity once someone has already signed in with Google: the session
 * is their uid, and the client must not write `farms/*` itself (rules require
 * a PIN token or the whitelist, and a denied write used to leave the screen
 * on "Initializing your account…").
 *
 * Same enrollment gate as create-farm (Plans/FIREBASE_BILLING.md §5.1). The
 * Google uid is the owner and a farm-role admin. `pinAuth` stays false so a
 * platform-admin claim already on the account is not rewritten into a PIN
 * session. An owner recovery PIN is stored for a wiped device.
 */

import {
  defaultModulesWithoutCropPacks,
  planDefaultFarmFeedOnCreate,
} from '../shared/farm/cropPacks.ts';
import {
  generatePinCode,
  newFarmId,
  pinDocId,
  type AccessPinRecord,
} from './accessPinCrypto.ts';
import { existingClaimsFor, farmMemberClaims, PINS } from './accessPinAuth.ts';
import {
  markEnrollmentCodeUsed,
  releaseEnrollmentCode,
  reserveEnrollmentCode,
} from './enrollmentCodes.ts';
import { getAdminAuth, getAdminDb } from './firebaseAdmin.ts';

export type OwnedFarmResult =
  | { ok: true; farmId: string; recoveryPin: string; role: 'admin' }
  | { ok: false; status: number; error: string };

export async function createOwnedFarmForCaller(input: {
  uid: string;
  farmName: string;
  displayName: string;
  enrollmentCode: string;
}): Promise<OwnedFarmResult> {
  const farmName = input.farmName.trim();
  const displayName = input.displayName.trim();
  if (!farmName || farmName.length < 2) {
    return { ok: false, status: 400, error: 'Enter a farm name (at least 2 characters).' };
  }
  if (!displayName || displayName.length < 2) {
    return { ok: false, status: 400, error: 'Enter your name (at least 2 characters).' };
  }

  const auth = getAdminAuth();
  const db = getAdminDb();
  const userRecord = await auth.getUser(input.uid);
  const email = userRecord.email || '';
  if (!email || email.endsWith('@sentinut.local')) {
    return {
      ok: false,
      status: 400,
      error: 'Sign in with the Google account that should own this farm.',
    };
  }

  const existing = await db.collection('users').doc(input.uid).get();
  const existingFarm = existing.data()?.farmId;
  if (typeof existingFarm === 'string' && existingFarm.length > 0) {
    return { ok: false, status: 409, error: 'This account already has a farm.' };
  }

  const enrollment = await reserveEnrollmentCode(input.enrollmentCode);
  if (!enrollment.ok || !enrollment.codeHash) {
    return {
      ok: false,
      status: enrollment.status ?? 403,
      error: enrollment.error ?? 'Enrollment code refused.',
    };
  }
  const enrollmentHash = enrollment.codeHash;

  try {
    const now = new Date().toISOString();
    const farmId = newFarmId();
    const recoveryCode = generatePinCode(8);
    const planned = planDefaultFarmFeedOnCreate(defaultModulesWithoutCropPacks(), now);
    const modules = planned.modules;
    const authEpoch = 1;
    const claims = farmMemberClaims(
      {
        farmId,
        role: 'admin',
        modules,
        authEpoch,
        pinAuth: false,
        farmEnabled: modules,
      },
      await existingClaimsFor(input.uid)
    );

    await auth.setCustomUserClaims(input.uid, claims);

    await db.collection('farms').doc(farmId).set({
      id: farmId,
      name: farmName.slice(0, 120),
      ownerUid: input.uid,
      createdAt: now,
      enabledModules: modules,
      cropPacks: planned.cropPacks,
      farmProfile: {
        enterprises: [],
        livestockEnabled: false,
        defaultSpeciesId: '',
      },
    });

    await db
      .collection('farms')
      .doc(farmId)
      .collection('settings')
      .doc('farm')
      .set(
        {
          irrigationSystemType: 'micro',
          farmName: farmName.slice(0, 120),
          farmProfile: {
            enterprises: [],
            livestockEnabled: false,
            defaultSpeciesId: '',
          },
        },
        { merge: true }
      );

    await db.collection('users').doc(input.uid).set({
      uid: input.uid,
      email,
      displayName,
      role: 'admin',
      farmId,
      modules,
      authEpoch,
      accessRevoked: false,
      subscriptionTier: 'free',
      hasAgreedToTerms: true,
      agreedToTermsAt: now,
      createdAt: existing.data()?.createdAt || now,
      authMethod: 'google',
    });

    await db.collection('users_public').doc(input.uid).set({
      uid: input.uid,
      displayName,
      role: 'admin',
      farmId,
    });

    const pinRecord: AccessPinRecord = {
      farmId,
      role: 'admin',
      label: 'Owner recovery',
      active: true,
      maxUses: null,
      useCount: 0,
      expiresAt: null,
      createdBy: input.uid,
      createdAt: now,
      modules,
      codeHint: `${recoveryCode.slice(0, 2)}••••${recoveryCode.slice(-2)}`,
    };
    await db.collection(PINS).doc(pinDocId(recoveryCode)).set(pinRecord);

    await markEnrollmentCodeUsed(enrollmentHash, { farmId, farmName: farmName.slice(0, 120) });

    return { ok: true, farmId, recoveryPin: recoveryCode, role: 'admin' };
  } catch (error) {
    await releaseEnrollmentCode(enrollmentHash);
    console.error('[auth] create-my-farm failed:', error);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to create farm',
    };
  }
}
