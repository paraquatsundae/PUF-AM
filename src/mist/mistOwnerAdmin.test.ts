import { describe, expect, it } from 'vitest';

import { allFarmModules } from '../../shared/auth/farmModules.ts';
import { resolveAdminSurface } from '../lib/adminAuth.ts';
import { navGroups, visibleGroupItems } from '../lib/navConfig.ts';
import { sessionDisplayName } from '../lib/sessionIdentity.ts';
import { WORKSHOP_USER_DATA } from '../lib/workshopMode.ts';
import { createMistSessionRecord } from './mistDeviceSession.ts';
import { farmRoleForMistRole, mistSessionToUserData } from './mistFarmSession.ts';

function ownerSession() {
  return createMistSessionRecord({
    farmId: 'a'.repeat(32),
    farmName: 'Shed paddock',
    displayName: 'George',
    farmSeed: new Uint8Array(32).fill(7),
    role: 'owner',
  });
}

function systemItems(isAdmin: boolean, isPlatformAdmin: boolean) {
  const system = navGroups.find((group) => group.id === 'system');
  if (!system) throw new Error('missing system nav group');
  return visibleGroupItems(
    system,
    isAdmin,
    isAdmin ? 'admin' : 'farmer',
    allFarmModules(),
    allFarmModules(),
    isPlatformAdmin,
  );
}

describe('Freenet farm owner is farm admin, not workshop', () => {
  it('does not treat a missing Firebase user as the workshop identity', () => {
    const userData = mistSessionToUserData(ownerSession());
    expect(userData.uid).not.toBe(WORKSHOP_USER_DATA.uid);
    expect(userData.displayName).not.toBe(WORKSHOP_USER_DATA.displayName);
    expect(userData.farmId).not.toBe(WORKSHOP_USER_DATA.farmId);
    expect(sessionDisplayName(null, userData)).not.toBe('Workshop User');
  });

  it('maps an owner with FarmSeed onto farm-role admin', () => {
    const userData = mistSessionToUserData(ownerSession());
    expect(userData.displayName).toBe('George');
    expect(userData.role).toBe('admin');
    expect(farmRoleForMistRole('owner')).toBe('admin');
    expect(userData.email).toBe('mist@local.pufam');
  });

  it('names the operator from userData when Firebase user is null', () => {
    const userData = mistSessionToUserData(ownerSession());
    expect(sessionDisplayName(null, userData)).toBe('George');
    expect(sessionDisplayName(null, userData)).not.toBe('Workshop User');
    expect(sessionDisplayName(null, { email: 'mist@local.pufam' })).not.toBe('Workshop User');
  });

  it('shows the Admin nav for a farm admin without hosted platform claims', () => {
    const hrefs = systemItems(true, false).map((item) => item.href);
    expect(hrefs).toContain('/admin');
    expect(systemItems(false, false).map((item) => item.href)).not.toContain('/admin');
  });

  it('opens the farm admin surface, not hosted Cloud admin', () => {
    expect(resolveAdminSurface({ isAdmin: true, isPlatformAdmin: false })).toBe('farm');
    expect(resolveAdminSurface({ isAdmin: true, isPlatformAdmin: true })).toBe('platform');
    expect(resolveAdminSurface({ isAdmin: false, isPlatformAdmin: false })).toBe('denied');
  });
});
