/**
 * Mist farm session helpers — parallel to Firebase Auth, not a replacement in production builds.
 */

import type { UserData } from '../contexts/AuthContext';
import { allFarmModules } from '../../shared/auth/farmModules';
import { getFarmStoreBackend, isMistFarmStoreActive } from './farmStoreBackend.ts';
import { hasMistDeviceSession, loadMistDeviceSession, type MistDeviceSession } from './mistDeviceSession.ts';

export function isMistFarmSessionActive(): boolean {
  return isMistFarmStoreActive() && hasMistDeviceSession();
}

export function mistSessionToUserData(session: MistDeviceSession): UserData {
  return {
    uid: session.uid,
    email: 'mist@local.pufam',
    displayName: session.displayName,
    role: session.role,
    farmId: session.farmId,
    modules: allFarmModules(),
    authEpoch: 1,
    subscriptionTier: 'free',
    hasAgreedToTerms: true,
    createdAt: session.createdAt,
  };
}

/** Load persisted mist session when mist backend is selected. */
export async function tryLoadMistFarmSession(
  devicePin?: string,
): Promise<{ session: MistDeviceSession; userData: UserData } | null> {
  if (getFarmStoreBackend() !== 'mist') return null;
  const session = await loadMistDeviceSession(devicePin);
  if (!session) return null;
  return { session, userData: mistSessionToUserData(session) };
}
