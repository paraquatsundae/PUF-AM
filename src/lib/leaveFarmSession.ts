/**
 * Clear the keys that would restore a farm session after Sign out.
 *
 * Sign out is account-switch, not disaster recovery: IndexedDB farm records
 * stay. A packaged APK must be able to reach `/login` Join after this runs
 * (`Plans/LOGIN_JOIN_SINGLE_BOX.md` — signed-in users never see that box).
 *
 * A hybrid *member* device keeps its sealed Freenet-mirror seed
 * (`Plans/FREENET_NETWORK_PACK.md` §3) so the next cloud sign-in can still Send.
 * A Freenet login, a cloud-farm mirror, or a leftover seed with no cloud farm
 * is cleared, and `pufam.farmStoreBackend` is set back to `firebase` so a mist
 * preference cannot immediately re-open the farm.
 */

import {
  canShowWelcomeBack,
  clearDeviceRememberedFlag,
  clearRememberedLoginHints,
} from './deviceSession.ts';
import { isFarmCodeSession } from './farmPipes.ts';
import { initialLoginStep, type LoginStep } from './loginStorageChoice.ts';
import { clearSessionUnlock } from './unlockPin.ts';
import { getFarmStoreBackend, setFarmStoreBackend } from '../mist/farmStoreBackend.ts';
import {
  clearMistDeviceSession,
  hasMistDeviceSession,
  mistSessionCloudFarmId,
} from '../mist/mistDeviceSession.ts';

export type LeaveFarmSessionResult = {
  /** Mist/Freenet was the login, a mirror, or a leftover non-hybrid seed. */
  clearedMistLogin: boolean;
  /** Hybrid member: sealed seed kept for the next cloud sign-in. */
  keptHybridSeed: boolean;
};

/**
 * A hybrid *member* holds a Firebase login plus the sealed key to that farm's
 * Freenet mirror. Signing out is the cloud sign-out; the seed stays.
 */
export function isHybridMemberDevice(): boolean {
  return !isFarmCodeSession() && mistSessionCloudFarmId() !== null;
}

export function leaveFarmSession(): LeaveFarmSessionResult {
  // Welcome-back (name + last farm) is enough for `initialLoginStep` to skip
  // Join and for `useLoginFlow` to look like a restored session. Clear it.
  clearRememberedLoginHints();
  clearDeviceRememberedFlag();
  clearSessionUnlock();

  const hybridMember = isHybridMemberDevice();
  const mistLogin = !hybridMember && (isFarmCodeSession() || hasMistDeviceSession());

  if (mistLogin) {
    clearMistDeviceSession();
    setFarmStoreBackend('firebase');
    return { clearedMistLogin: true, keptHybridSeed: false };
  }

  // A leftover mist preference with no session would still flip experimental
  // UI on (`isMistExperimentalEnabled`). Only a hybrid member keeps backend as-is.
  if (!hybridMember && getFarmStoreBackend() === 'mist') {
    setFarmStoreBackend('firebase');
  }

  return { clearedMistLogin: false, keptHybridSeed: hybridMember };
}

/** Where `/login` must open after `leaveFarmSession` — always the Join box. */
export function loginStepAfterLeaveFarmSession(): LoginStep {
  return initialLoginStep({
    freenet: 'hidden',
    welcomeBack: canShowWelcomeBack(),
    backend: getFarmStoreBackend(),
  });
}
