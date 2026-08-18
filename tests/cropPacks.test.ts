import { describe, expect, it } from 'vitest';
import {
  clampModulesToActivePacks,
  installedPackModuleRows,
  isPackActive,
  isPackInstalled,
  isPackModuleOffered,
  listCropPacks,
  migrateLegacyChillPack,
  migrateLegacyPacks,
  migrateLegacyWalnutPack,
  optionalOpsModules,
  packOwningModule,
  planActivatePack,
  planDeactivatePack,
  planDeletePack,
  planInstallPack,
  resolveFarmCropPacks,
  syncModulesWithCropPacks,
} from '../shared/farm/cropPacks';
import { defaultModulesWithoutCropPacks, resolveFarmEnabledModules } from '../shared/auth/farmModules';

describe('cropPacks catalog', () => {
  it('registers walnut blight with blight module, crop category, and owned settings keys', () => {
    const packs = listCropPacks();
    expect(packs.map((p) => p.id)).toContain('walnut_blight');
    const walnut = packs.find((p) => p.id === 'walnut_blight')!;
    expect(walnut.modules).toEqual(['blight']);
    expect(walnut.category).toBe('crop');
    expect(walnut.settingsDocId).toBe('model_params');
    expect(walnut.primaryPath).toBe('/blight');
    expect(walnut.settingsOwnedKeys).toContain('orchardInoculumLevel');
    expect(walnut.settingsOwnedKeys).not.toContain('marketPrice');
  });

  it('registers chill portions with chill module, crop category, and owned settings keys', () => {
    const packs = listCropPacks();
    expect(packs.map((p) => p.id)).toContain('chill_portions');
    const chill = packs.find((p) => p.id === 'chill_portions')!;
    expect(chill.modules).toEqual(['chill']);
    expect(chill.category).toBe('crop');
    expect(chill.settingsDocId).toBe('chill_portions');
    expect(chill.primaryPath).toBe('/weather-events');
    expect(chill.settingsOwnedKeys).toContain('weatherSource');
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

describe('Farm Modules pack labeling helpers (CP-03)', () => {
  const now = '2026-08-11T12:00:00.000Z';

  it('maps blight to walnut blight pack and keeps ops modules unowned', () => {
    expect(packOwningModule('blight')?.id).toBe('walnut_blight');
    expect(packOwningModule('chill')?.id).toBe('chill_portions');
    expect(packOwningModule('map')).toBeUndefined();
    expect(optionalOpsModules()).toContain('map');
    expect(optionalOpsModules()).not.toContain('blight');
    expect(optionalOpsModules()).not.toContain('chill');
  });

  it('offers pack modules only when pack is active', () => {
    const inactive = {
      walnut_blight: { status: 'inactive' as const, installedAt: now },
    };
    const active = {
      walnut_blight: { status: 'active' as const, installedAt: now, activatedAt: now },
    };
    expect(isPackModuleOffered('blight', inactive)).toBe(false);
    expect(isPackModuleOffered('blight', active)).toBe(true);
    expect(isPackModuleOffered('diary', inactive)).toBe(true);
  });

  it('lists installed pack module rows with from-pack metadata', () => {
    const packs = {
      walnut_blight: { status: 'inactive' as const, installedAt: now },
    };
    expect(installedPackModuleRows({})).toEqual([]);
    expect(installedPackModuleRows(packs)).toEqual([
      {
        moduleId: 'blight',
        pack: expect.objectContaining({ id: 'walnut_blight', label: 'Walnut blight' }),
        active: false,
      },
    ]);
  });

  it('clamps orphan pack modules without forcing active pack modules on', () => {
    const packs = {
      walnut_blight: { status: 'active' as const, installedAt: now, activatedAt: now },
    };
    const withoutBlight = clampModulesToActivePacks(defaultModulesWithoutCropPacks(), packs);
    expect(withoutBlight).not.toContain('blight');

    const inactive = {
      walnut_blight: { status: 'inactive' as const, installedAt: now },
    };
    const stripped = clampModulesToActivePacks(
      resolveFarmEnabledModules([...defaultModulesWithoutCropPacks(), 'blight']),
      inactive
    );
    expect(stripped).not.toContain('blight');
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

describe('migrateLegacyChillPack', () => {
  it('installs active chill_portions when farm has orchard enterprise', () => {
    const result = migrateLegacyChillPack({
      cropPacks: {},
      modules: defaultModulesWithoutCropPacks(),
      profile: {
        enterprises: ['orchard_tree'],
        livestockEnabled: false,
        defaultSpeciesId: '',
      },
      nowIso: '2026-08-16T12:00:00.000Z',
    });
    expect(result.migrated).toBe(true);
    expect(result.cropPacks.chill_portions?.status).toBe('active');
    expect(result.modules).toContain('chill');
  });

  it('installs chill when walnut pack is already active', () => {
    const result = migrateLegacyChillPack({
      cropPacks: {
        walnut_blight: {
          status: 'active',
          installedAt: '2026-08-11T12:00:00.000Z',
          activatedAt: '2026-08-11T12:00:00.000Z',
        },
      },
      modules: [...defaultModulesWithoutCropPacks(), 'blight'],
      profile: {
        enterprises: [],
        livestockEnabled: false,
        defaultSpeciesId: '',
      },
      nowIso: '2026-08-16T12:00:00.000Z',
    });
    expect(result.migrated).toBe(true);
    expect(result.cropPacks.chill_portions?.status).toBe('active');
  });

  it('leaves broadacre farms alone', () => {
    const result = migrateLegacyChillPack({
      cropPacks: {},
      modules: defaultModulesWithoutCropPacks(),
      profile: {
        enterprises: ['broadacre'],
        livestockEnabled: false,
        defaultSpeciesId: '',
      },
    });
    expect(result.migrated).toBe(false);
    expect(result.cropPacks.chill_portions).toBeUndefined();
    expect(result.modules).not.toContain('chill');
  });
});

describe('migrateLegacyPacks', () => {
  it('restores walnut blight and chill together on a walnut orchard', () => {
    const result = migrateLegacyPacks({
      cropPacks: {},
      modules: defaultModulesWithoutCropPacks(),
      profile: {
        enterprises: ['orchard_tree'],
        livestockEnabled: false,
        defaultSpeciesId: 'walnut',
      },
      nowIso: '2026-08-16T12:00:00.000Z',
    });
    expect(result.migrated).toBe(true);
    expect(result.cropPacks.walnut_blight?.status).toBe('active');
    expect(result.cropPacks.chill_portions?.status).toBe('active');
    expect(result.modules).toContain('blight');
    expect(result.modules).toContain('chill');
  });
});
