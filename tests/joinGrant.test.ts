/**
 * Preset → ticket → modules, and what happens to tickets minted before presets.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §3b
 */

import { describe, expect, it } from 'vitest';

import {
  buildJoinPermissions,
  findJoinPreset,
  joinPresets,
  joinPresetsForFarm,
  modulesForJoinRole,
  readJoinGrant,
} from '../shared/sync/joinGrant.ts';
import { parseJoinManifestV2 } from '../shared/sync/joinTicket.ts';
import {
  WALNUT_PACK_MODULES,
  allFarmModules,
  effectiveModules,
} from '../shared/auth/farmModules.ts';

const preset = (id: string) => {
  const found = findJoinPreset(id);
  if (!found) throw new Error(`no preset ${id}`);
  return found;
};

/** A manifest as it comes off the wire, minus whatever this test is varying. */
function manifestFields(over: Record<string, unknown> = {}) {
  return {
    v: 2,
    farmId: 'a'.repeat(32),
    hotUri: 'FN02@hot',
    bonesUri: 'FN02@bones',
    ticket: 'PUF-K7M2-9Q4X',
    role: 'farmer',
    ...over,
  };
}

describe('join presets', () => {
  it('offers the cloud invite presets plus owner', () => {
    expect(joinPresets().map((p) => p.id)).toEqual([
      'owner',
      'full_farmer',
      'field_only',
      'crop_scout',
      'records',
      'viewer',
      'admin',
    ]);
  });

  it('maps each preset to the write ceiling the wire carries', () => {
    expect(preset('owner').role).toBe('owner');
    expect(preset('admin').role).toBe('admin');
    expect(preset('full_farmer').role).toBe('farmer');
    expect(preset('field_only').role).toBe('farmer');
    expect(preset('crop_scout').role).toBe('farmer');
    expect(preset('records').role).toBe('farmer');
    expect(preset('viewer').role).toBe('viewer');
  });

  it('drops walnut-pack presets and modules on a farm without the pack', () => {
    const presets = joinPresetsForFarm(allFarmModules(), {
      excludeModules: WALNUT_PACK_MODULES,
    });
    for (const p of presets) expect(p.modules).not.toContain('blight');
    expect(presets.find((p) => p.id === 'crop_scout')?.modules).toEqual([
      'dashboard',
      'water',
      'nutrition',
    ]);
  });
});

describe('buildJoinPermissions', () => {
  it('writes only values a manifest may carry', () => {
    const permissions = buildJoinPermissions(preset('field_only'));
    expect(permissions).toEqual({ preset: 'field_only', modules: 'dashboard,map,diary' });
    for (const value of Object.values(permissions)) {
      expect(['boolean', 'number', 'string']).toContain(typeof value);
    }
  });

  it('survives the manifest sanitiser untouched', () => {
    const parsed = parseJoinManifestV2(
      manifestFields({ permissions: buildJoinPermissions(preset('crop_scout')) }),
    );
    expect(parsed?.permissions).toEqual({
      preset: 'crop_scout',
      modules: 'dashboard,blight,water,nutrition',
    });
  });
});

describe('readJoinGrant', () => {
  it('round-trips a preset from mint to nav', () => {
    const parsed = parseJoinManifestV2(
      manifestFields({ permissions: buildJoinPermissions(preset('field_only')) }),
    );
    const grant = readJoinGrant(parsed!);

    expect(grant.preset).toBe('field_only');
    expect(grant.role).toBe('farmer');
    expect(grant.fromPermissions).toBe(true);
    expect(grant.modules).toContain('map');
    expect(grant.modules).toContain('diary');
    expect(grant.modules).not.toContain('financials');
    expect(grant.modules).not.toContain('farm_setup');
  });

  it('keeps Settings so a joiner can re-join or sync without the owner', () => {
    for (const id of ['field_only', 'crop_scout', 'records', 'viewer']) {
      const grant = readJoinGrant({
        role: preset(id).role,
        permissions: buildJoinPermissions(preset(id)),
      });
      expect(grant.modules).toContain('settings');
      expect(grant.modules).toContain('dashboard');
    }
  });

  it('prefers the explicit module list over the preset it names', () => {
    const grant = readJoinGrant({
      role: 'farmer',
      permissions: { preset: 'field_only', modules: 'harvest' },
    });
    expect(grant.preset).toBe('field_only');
    expect(grant.modules).toContain('harvest');
    expect(grant.modules).not.toContain('map');
  });

  it('falls back to the preset when the module list is unusable', () => {
    const grant = readJoinGrant({
      role: 'farmer',
      permissions: { preset: 'records', modules: 'not_a_module,,nonsense' },
    });
    expect(grant.modules).toContain('harvest');
    expect(grant.modules).toContain('financials');
    // Still the ticket's own grant, not the role's — the preset said so.
    expect(grant.fromPermissions).toBe(true);
    expect(grant.modules).not.toContain('map');
  });

  it('ignores a preset name it does not know', () => {
    const grant = readJoinGrant({ role: 'farmer', permissions: { preset: 'tractor_driver' } });
    expect(grant.preset).toBeUndefined();
    expect(grant.modules).toEqual(readJoinGrant({ role: 'farmer' }).modules);
  });
});

describe('tickets minted before presets', () => {
  it('grants the role defaults when a manifest carries no permissions', () => {
    const parsed = parseJoinManifestV2(manifestFields({ role: 'farmer' }));
    expect(parsed?.permissions).toBeUndefined();

    const grant = readJoinGrant(parsed!);
    expect(grant.preset).toBeUndefined();
    expect(grant.fromPermissions).toBe(false);
    expect(grant.modules).toEqual(readJoinGrant({ role: 'farmer' }).modules);
    expect(grant.modules).toContain('map');
    expect(grant.modules).toContain('harvest');
    expect(grant.modules).not.toContain('financials');
  });

  it('still hands an owner or admin everything', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(modulesForJoinRole(role)).toEqual(allFarmModules());
      // The module list is moot for an admin ceiling, but it must not narrow.
      expect(effectiveModules('admin', readJoinGrant({ role }).modules)).toEqual(allFarmModules());
    }
  });

  it('treats a manifest with no role at all as the default crew role', () => {
    const grant = readJoinGrant({});
    expect(grant.role).toBe('farmer');
    expect(grant.modules).toContain('diary');
  });
});

describe('what the nav ends up with', () => {
  it('field_only shows Map and Diary and not Financials', () => {
    const grant = readJoinGrant({
      role: 'farmer',
      permissions: buildJoinPermissions(preset('field_only')),
    });
    const nav = effectiveModules(grant.role, grant.modules, allFarmModules());

    expect(nav).toContain('map');
    expect(nav).toContain('diary');
    expect(nav).not.toContain('financials');
    expect(nav).not.toContain('farm_management');
  });

  it('a viewer keeps the work modules but cannot be an admin', () => {
    const grant = readJoinGrant({
      role: 'viewer',
      permissions: buildJoinPermissions(preset('viewer')),
    });
    expect(grant.role).toBe('viewer');
    expect(effectiveModules(grant.role, grant.modules, allFarmModules())).toContain('harvest');
  });
});
