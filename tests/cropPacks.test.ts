import { describe, expect, it } from 'vitest';
import {
  clampModulesToActivePacks,
  installedPackModuleRows,
  isPackActive,
  isPackInstalled,
  isPackModuleOffered,
  allPackModuleIds,
  defaultModulesWithoutCropPacks,
  listCropPacks,
  migrateLegacyChillPack,
  migrateLegacyPacks,
  migrateLegacyWalnutPack,
  moduleListEquals,
  offeredFarmModules,
  optionalOpsModules,
  packModulesToExclude,
  packOwningModule,
  planActivatePack,
  planDeactivatePack,
  planDeletePack,
  planInstallPack,
  resolveFarmCropPacks,
  syncModulesWithCropPacks,
  withPackModules,
  withoutPackModules,
} from '../shared/farm/cropPacks';
import { resolveFarmEnabledModules } from '../shared/auth/farmModules';

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

  it('registers water, nutrition, and harvest as generic ops packs', () => {
    const packs = listCropPacks();
    const water = packs.find((p) => p.id === 'water')!;
    const nutrition = packs.find((p) => p.id === 'nutrition')!;
    const harvest = packs.find((p) => p.id === 'harvest')!;
    const drying = packs.find((p) => p.id === 'drying')!;
    expect(water.modules).toEqual(['water']);
    expect(water.category).toBe('generic');
    expect(water.settingsDocId).toBeNull();
    expect(water.primaryPath).toBe('/water');
    expect(nutrition.modules).toEqual(['nutrition']);
    expect(nutrition.settingsDocId).toBeNull();
    expect(harvest.modules).toEqual(['harvest']);
    expect(harvest.category).toBe('generic');
    expect(harvest.settingsDocId).toBeNull();
    expect(harvest.primaryPath).toBe('/harvest');
    expect(drying.modules).toEqual(['drying']);
    expect(drying.category).toBe('crop');
    expect(drying.settingsDocId).toBe('assets');
    expect(drying.settingsOwnedKeys).toEqual(['dryers']);
    expect(drying.primaryPath).toBe('/drying');
  });

  it('derives pack-owned modules from CROP_PACKS', () => {
    const owned = allPackModuleIds();
    expect(owned).toEqual(
      expect.arrayContaining(['blight', 'chill', 'water', 'nutrition', 'harvest', 'drying'])
    );
    expect(owned).toHaveLength(
      new Set(listCropPacks().flatMap((p) => p.modules)).size
    );

    const mods = defaultModulesWithoutCropPacks();
    expect(mods).not.toContain('blight');
    expect(mods).not.toContain('chill');
    expect(mods).not.toContain('water');
    expect(mods).not.toContain('nutrition');
    expect(mods).not.toContain('harvest');
    expect(mods).not.toContain('drying');
    expect(mods).toContain('map');
    expect(withPackModules(mods, 'walnut_blight')).toContain('blight');
    expect(withoutPackModules(withPackModules(mods, 'walnut_blight'), 'walnut_blight')).not.toContain(
      'blight'
    );
  });

  it('excludes pack modules from PIN/join presets when the pack is not offered', () => {
    expect(packModulesToExclude({})).toEqual(
      expect.arrayContaining(['blight', 'chill', 'water', 'nutrition', 'harvest', 'drying'])
    );
    expect(
      packModulesToExclude(
        {
          walnut_blight: { status: 'active', installedAt: '2026-01-01T00:00:00.000Z' },
        },
        { walnut_blight: true, chill_portions: false }
      )
    ).toEqual(expect.arrayContaining(['chill', 'water', 'nutrition', 'harvest', 'drying']));
    expect(
      packModulesToExclude({}, undefined, ['dashboard', 'map', 'water'])
    ).not.toContain('water');
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

  it('offers active pack modules even when enabledModules omitted them', () => {
    const packs = {
      drying: { status: 'active' as const, installedAt: now, activatedAt: now },
      harvest: { status: 'active' as const, installedAt: now, activatedAt: now },
    };
    const catalog = resolveFarmEnabledModules([...baseMods, 'harvest']);
    expect(catalog).not.toContain('drying');
    const offered = offeredFarmModules(catalog, packs);
    expect(offered).toContain('drying');
    expect(offered).toContain('harvest');
    expect(offered).not.toContain('water');
    expect(moduleListEquals(offered, offeredFarmModules(catalog, packs))).toBe(true);
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
    expect(optionalOpsModules()).not.toContain('water');
    expect(optionalOpsModules()).not.toContain('nutrition');
    expect(optionalOpsModules()).not.toContain('harvest');
    expect(optionalOpsModules()).not.toContain('drying');
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
    expect(result.cropPacks.water).toBeUndefined();
  });

  it('installs water, nutrition, and harvest when those modules were already on the farm', () => {
    const result = migrateLegacyPacks({
      cropPacks: {},
      modules: [...defaultModulesWithoutCropPacks(), 'water', 'nutrition', 'harvest'],
      profile: {
        enterprises: ['broadacre'],
        livestockEnabled: false,
        defaultSpeciesId: '',
      },
      nowIso: '2026-08-24T12:00:00.000Z',
    });
    expect(result.migrated).toBe(true);
    expect(result.cropPacks.water?.status).toBe('active');
    expect(result.cropPacks.nutrition?.status).toBe('active');
    expect(result.cropPacks.harvest?.status).toBe('active');
    expect(result.cropPacks.drying?.status).toBe('active');
    expect(result.modules).toEqual(expect.arrayContaining(['water', 'nutrition', 'harvest', 'drying']));
  });

  it('splits a legacy harvest_drying pack into harvest + drying', () => {
    const result = migrateLegacyPacks({
      cropPacks: {
        harvest_drying: {
          status: 'active',
          installedAt: '2026-08-24T00:00:00.000Z',
          activatedAt: '2026-08-24T00:00:00.000Z',
        },
      },
      modules: [...defaultModulesWithoutCropPacks(), 'harvest'],
      nowIso: '2026-08-24T13:00:00.000Z',
    });
    expect(result.migrated).toBe(true);
    expect(result.cropPacks.harvest?.status).toBe('active');
    expect(result.cropPacks.drying?.status).toBe('active');
    expect('harvest_drying' in result.cropPacks).toBe(false);
    expect(result.modules).toContain('harvest');
    expect(result.modules).toContain('drying');
  });

  it('installs drying when harvest pack is already present and drying is not', () => {
    const result = migrateLegacyPacks({
      cropPacks: {
        harvest: {
          status: 'active',
          installedAt: '2026-08-24T00:00:00.000Z',
          activatedAt: '2026-08-24T00:00:00.000Z',
        },
      },
      modules: [...defaultModulesWithoutCropPacks(), 'harvest'],
      nowIso: '2026-08-24T14:00:00.000Z',
    });
    expect(result.migrated).toBe(true);
    expect(result.cropPacks.harvest?.status).toBe('active');
    expect(result.cropPacks.drying?.status).toBe('active');
    expect(result.modules).toContain('drying');
  });
});
