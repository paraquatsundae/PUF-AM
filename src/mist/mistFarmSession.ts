/**
 * Mist farm session helpers — parallel to Firebase Auth, not a replacement in production builds.
 */

import type { UserData } from '../contexts/AuthContext';
import { allFarmModules, type FarmRole } from '../../shared/auth/farmModules';
import type { JoinGrant } from '../../shared/sync/joinGrant.ts';
import { getFarmStoreBackend, isMistFarmStoreActive } from './farmStoreBackend.ts';
import {
  getMistSessionGrant,
  hasMistDeviceSession,
  loadMistDeviceSession,
  mistSessionCloudFarmId,
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

/**
 * The grant wins over the sealed session where they disagree, and they do.
 *
 * A device that recovered a FarmCode seals itself as `farmer` before it knows
 * anything — recovery proves identity, not membership — and only learns what it
 * really is when a join ticket resolves. That answer lands in the session meta
 * (`markMistJoinTicketAccepted`), because the blob cannot be re-sealed without
 * the device PIN. Reading the role from the blob is therefore reading the
 * guess, which is why a Crop scout used to arrive holding every module.
 *
 * With no meta at all there is nothing to apply, so the old behaviour stands.
 *
 * A **mirror of a cloud farm** (`cloudFarmId` on the session or its meta) is
 * read-only whatever the ticket said: Firestore is the authority for that farm
 * and this device has no Firebase membership to write with, so it lands as a
 * `viewer`. Editing means joining the cloud farm with an invite PIN.
 * `Plans/FREENET_NETWORK_PACK.md` §3.
 */
export function mistSessionToUserData(
  session: MistDeviceSession,
  grant: JoinGrant | null = getMistSessionGrant(),
  cloudFarmId: string | null = mistSessionCloudFarmId(),
): UserData {
  const mirror = Boolean(session.cloudFarmId || cloudFarmId);
  return {
    uid: session.uid,
    email: 'mist@local.pufam',
    displayName: session.displayName,
    role: mirror ? 'viewer' : farmRoleForMistRole(grant?.role ?? session.role),
    farmId: session.farmId,
    modules: grant ? grant.modules : allFarmModules(),
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
