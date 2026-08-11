import { describe, expect, it } from 'vitest';
import {
  isPackActive,
  isPackInstalled,
  listCropPacks,
  migrateLegacyWalnutPack,
  planActivatePack,
  planDeactivatePack,
  planDeletePack,
  planInstallPack,
  resolveFarmCropPacks,
  syncModulesWithCropPacks,
} from '../shared/farm/cropPacks';
import { defaultModulesWithoutCropPacks, resolveFarmEnabledModules } from '../shared/auth/farmModules';

describe('cropPacks catalog', () => {
  it('registers walnut blight with blight module and owned settings keys', () => {
    const packs = listCropPacks();
    expect(packs.map((p) => p.id)).toContain('walnut_blight');
    const walnut = packs.find((p) => p.id === 'walnut_blight')!;
    expect(walnut.modules).toEqual(['blight']);
    expect(walnut.settingsDocId).toBe('model_params');
    expect(walnut.settingsOwnedKeys).toContain('orchardInoculumLevel');
    expect(walnut.settingsOwnedKeys).not.toContain('marketPrice');
  });

  it('resolves and rejects junk cropPacks maps', () => {
    expect(resolveFarmCropPacks(undefined)).toEqual({});
    expect(
      resolveFarmCropPacks({
        walnut_blight: { status: 'active', installedAt: '2026-01-01T00:00:00.000Z' },
        nope: { status: 'active', installedAt: 'x' },
      }).walnut_blight?.status
    ).toBe('active');
  });
});

describe('cropPack lifecycle plans', () => {
  const baseMods = defaultModulesWithoutCropPacks();
  const now = '2026-08-11T12:00:00.000Z';

  it('install (default activate) adds blight; deactivate strips; activate restores; delete removes entry', () => {
    const installed = planInstallPack({}, baseMods, 'walnut_blight', now, true);
    expect(isPackInstalled(installed.cropPacks, 'walnut_blight')).toBe(true);
    expect(isPackActive(installed.cropPacks, 'walnut_blight')).toBe(true);
    expect(installed.modules).toContain('blight');

    const off = planDeactivatePack(installed.cropPacks, installed.modules, 'walnut_blight');
    expect(isPackActive(off.cropPacks, 'walnut_blight')).toBe(false);
    expect(off.modules).not.toContain('blight');
    expect(isPackInstalled(off.cropPacks, 'walnut_blight')).toBe(true);

    const on = planActivatePack(off.cropPacks, off.modules, 'walnut_blight', now);
    expect(isPackActive(on.cropPacks, 'walnut_blight')).toBe(true);
    expect(on.modules).toContain('blight');

    const deleted = planDeletePack(on.cropPacks, on.modules, 'walnut_blight');
    expect(isPackInstalled(deleted.cropPacks, 'walnut_blight')).toBe(false);
    expect(deleted.modules).not.toContain('blight');
  });

  it('syncModulesWithCropPacks strips pack modules when pack inactive', () => {
    const packs = {
      walnut_blight: {
        status: 'inactive' as const,
        installedAt: now,
      },
    };
    const synced = syncModulesWithCropPacks(
      resolveFarmEnabledModules([...baseMods, 'blight']),
      packs
    );
    expect(synced).not.toContain('blight');
  });
});

describe('migrateLegacyWalnutPack', () => {
  it('installs active walnut_blight when farm has walnut profile and no cropPacks yet', () => {
    const result = migrateLegacyWalnutPack({
      cropPacks: {},
      modules: defaultModulesWithoutCropPacks(),
      profile: {
        enterprises: ['orchard_tree'],
        livestockEnabled: false,
        defaultSpeciesId: 'walnut',
      },
      nowIso: '2026-08-11T12:00:00.000Z',
    });
    expect(result.migrated).toBe(true);
    expect(result.cropPacks.walnut_blight?.status).toBe('active');
    expect(result.modules).toContain('blight');
  });

  it('does not migrate twice', () => {
    const first = migrateLegacyWalnutPack({
      cropPacks: {},
      modules: defaultModulesWithoutCropPacks(),
      blocks: [{ species: 'walnut' }],
      nowIso: '2026-08-11T12:00:00.000Z',
    });
    const second = migrateLegacyWalnutPack({
      cropPacks: first.cropPacks,
      modules: first.modules,
      blocks: [{ species: 'walnut' }],
    });
    expect(second.migrated).toBe(false);
  });

  it('leaves non-walnut farms alone', () => {
    const result = migrateLegacyWalnutPack({
      cropPacks: {},
      modules: defaultModulesWithoutCropPacks(),
      profile: {
        enterprises: ['broadacre'],
        livestockEnabled: false,
        defaultSpeciesId: '',
      },
    });
    expect(result.migrated).toBe(false);
    expect(result.cropPacks.walnut_blight).toBeUndefined();
    expect(result.modules).not.toContain('blight');
  });
});
