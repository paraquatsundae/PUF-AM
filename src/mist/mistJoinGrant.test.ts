/**
 * The grant a ticket carried, applied to the session it created.
 *
 * The interesting case is the mismatch: a device seals itself as `farmer` at
 * FarmCode recovery, before it knows what it is, and the ticket answers later.
 * Reading the sealed blob rather than the grant is what used to hand a Crop
 * scout every module in the nav.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §3b
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { allFarmModules, effectiveModules } from '../../shared/auth/farmModules.ts';
import {
  buildJoinPermissions,
  findJoinPreset,
  readJoinGrant,
  type JoinPresetId,
} from '../../shared/sync/joinGrant.ts';
import {
  createMistSessionRecord,
  getMistSessionGrant,
  markMistJoinTicketAccepted,
  saveMistSessionMeta,
  type MistSessionMeta,
} from './mistDeviceSession.ts';
import { mistSessionToUserData } from './mistFarmSession.ts';

const mockStorage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mockStorage.set(k, v);
  },
  removeItem: (k: string) => {
    mockStorage.delete(k);
  },
  clear: () => mockStorage.clear(),
  key: () => null,
  length: 0,
});

const FARM_ID = 'a'.repeat(32);

/** What FarmCode recovery leaves behind: a guess of `farmer`, nothing granted. */
function recoveredSession() {
  return createMistSessionRecord({
    farmId: FARM_ID,
    farmName: 'Recovered farm',
    displayName: 'Laptop B',
    farmSeed: new Uint8Array(32).fill(4),
    role: 'farmer',
  });
}

function seedMeta(over: Partial<MistSessionMeta> = {}): void {
  saveMistSessionMeta({
    farmId: FARM_ID,
    farmName: 'Recovered farm',
    displayName: 'Laptop B',
    hasDevicePin: false,
    ...over,
  });
}

/** Accept a ticket minted against `presetId`, as the join action would. */
function acceptTicketFor(presetId: JoinPresetId): void {
  const preset = findJoinPreset(presetId);
  if (!preset) throw new Error(`no preset ${presetId}`);
  markMistJoinTicketAccepted(
    readJoinGrant({ role: preset.role, permissions: buildJoinPermissions(preset) }),
  );
}

describe('applying a ticket grant to the session', () => {
  afterEach(() => {
    mockStorage.clear();
  });

  it('gives a field_only joiner Map and Diary and not Financials', () => {
    seedMeta({ role: 'farmer' });
    acceptTicketFor('field_only');

    const userData = mistSessionToUserData(recoveredSession());
    const nav = effectiveModules(userData.role, userData.modules, allFarmModules());

    expect(nav).toContain('map');
    expect(nav).toContain('diary');
    expect(nav).not.toContain('financials');
    expect(nav).not.toContain('farm_management');
    expect(nav).not.toContain('farm_setup');
  });

  it('records the preset so the session can say what it is', () => {
    seedMeta({ role: 'farmer' });
    acceptTicketFor('crop_scout');

    const grant = getMistSessionGrant();
    expect(grant?.preset).toBe('crop_scout');
    expect(grant?.fromPermissions).toBe(true);
    expect(grant?.modules).toContain('nutrition');
    expect(grant?.modules).not.toContain('map');
  });

  it('overrides the role the device guessed at recovery', () => {
    seedMeta({ role: 'farmer' });
    acceptTicketFor('viewer');

    // The sealed blob still says `farmer` — it cannot be re-sealed without the
    // device PIN, which is exactly why the grant lives in the meta.
    const session = recoveredSession();
    expect(session.role).toBe('farmer');
    expect(mistSessionToUserData(session).role).toBe('viewer');
  });

  it('leaves an owner holding everything', () => {
    seedMeta({ role: 'owner' });

    const userData = mistSessionToUserData(recoveredSession());
    expect(userData.role).toBe('admin');
    expect(effectiveModules(userData.role, userData.modules, allFarmModules())).toEqual(
      allFarmModules(),
    );
  });
});

describe('sessions from before presets', () => {
  afterEach(() => {
    mockStorage.clear();
  });

  it('falls back to role defaults when the meta has no module list', () => {
    seedMeta({ role: 'farmer', joinedViaTicket: true });

    const grant = getMistSessionGrant();
    expect(grant?.fromPermissions).toBe(false);
    expect(grant?.modules).toContain('harvest');
    expect(grant?.modules).not.toContain('financials');
  });

  // `WORK_MODULES` has no `settings`, so this device rebuilt a nav without it on
  // every launch: System showed About and nothing else, and the unlock PIN,
  // Wi‑Fi sync and re-join behind Settings were unreachable on the tablet.
  it('gives a pre-preset joiner Settings back', () => {
    seedMeta({ role: 'farmer', joinedViaTicket: true });

    const userData = mistSessionToUserData(recoveredSession());
    const nav = effectiveModules(userData.role, userData.modules, allFarmModules());

    expect(nav).toContain('settings');
    expect(nav).toContain('dashboard');
    expect(nav).not.toContain('financials');
  });

  it('treats a session with no recorded role as the device that minted the farm', () => {
    seedMeta();

    const userData = mistSessionToUserData(recoveredSession());
    expect(userData.role).toBe('admin');
    expect(effectiveModules(userData.role, userData.modules, allFarmModules())).toEqual(
      allFarmModules(),
    );
  });

  it('changes nothing when there is no session meta at all', () => {
    expect(getMistSessionGrant()).toBeNull();

    const userData = mistSessionToUserData(recoveredSession());
    expect(userData.role).toBe('farmer');
    expect(userData.modules).toEqual(allFarmModules());
  });

  it('drops junk that was hand-edited into the stored module list', () => {
    seedMeta({
      role: 'farmer',
      modules: ['map', 'not_a_module', 'diary'] as never,
    });

    expect(getMistSessionGrant()?.modules).toEqual([
      'dashboard',
      'settings',
      'map',
      'diary',
    ]);
  });
});
