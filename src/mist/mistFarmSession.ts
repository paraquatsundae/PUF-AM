/**
 * Mist farm session helpers — parallel to Firebase Auth, not a replacement in production builds.
 */

import type { UserData } from '../contexts/AuthContext';
import { allFarmModules, type FarmRole } from '../../shared/auth/farmModules';
import { getFarmStoreBackend, isMistFarmStoreActive } from './farmStoreBackend.ts';
import {
  hasMistDeviceSession,
  loadMistDeviceSession,
  type MistDeviceSession,
  type MistSessionRole,
} from './mistDeviceSession.ts';

export function isMistFarmSessionActive(): boolean {
  return isMistFarmStoreActive() && hasMistDeviceSession();
}

/**
 * `owner` is a mist-only rung above the Firebase role vocab — the module system
 * only understands `admin | farmer | viewer`, and an owner has at least an
 * admin's reach.
 */
export function farmRoleForMistRole(role: MistSessionRole): FarmRole {
  return role === 'owner' ? 'admin' : role;
}

export function mistSessionToUserData(session: MistDeviceSession): UserData {
  return {
    uid: session.uid,
    email: 'mist@local.pufam',
    displayName: session.displayName,
    role: farmRoleForMistRole(session.role),
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
