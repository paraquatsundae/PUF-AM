/**
 * These lock the behaviour the pack-activation inversion had to preserve.
 *
 * Before it, `useWalnutPack` / `useChillPack` held the legacy rules and each
 * caller hardcoded the two pack ids. The rules now live in one module and every
 * caller takes the whole map, so what matters is that the answers did not move.
 */
import { describe, expect, it } from 'vitest';
import {
  activeCropPacks,
  isCropPackActiveForFarm,
  packModulesToExclude,
  type CropPackActivationCtx,
  type FarmCropPacksMap,
} from '../shared/farm/cropPacks';

const installed = (status: 'active' | 'inactive'): FarmCropPacksMap['walnut_blight'] => ({
  status,
  installedAt: '2026-01-01T00:00:00.000Z',
});

const ctx = (over: Partial<CropPackActivationCtx> = {}): CropPackActivationCtx => ({
  packs: {},
  farmModules: [],
  ...over,
});

describe('isCropPackActiveForFarm', () => {
  it('lets an installed pack answer from its own status, not eligibility', () => {
    // Walnut blocks would make the legacy rule say yes; Install said no.
    const c = ctx({
      packs: { walnut_blight: installed('inactive') },
      farmModules: ['blight'],
      blocks: [{ species: 'walnut' }],
    });

    expect(isCropPackActiveForFarm('walnut_blight', c)).toBe(false);
  });

  it('honours an installed active pack', () => {
    const c = ctx({ packs: { walnut_blight: installed('active') } });
    expect(isCropPackActiveForFarm('walnut_blight', c)).toBe(true);
  });

  it('falls back to walnut eligibility when the farm never ran Install', () => {
    // Profile never saved, so the blight module is the only signal.
    expect(isCropPackActiveForFarm('walnut_blight', ctx({ farmModules: ['blight'] }))).toBe(true);
    expect(isCropPackActiveForFarm('walnut_blight', ctx({ farmModules: [] }))).toBe(false);
  });

  it('treats a walnut block as walnut even with the blight module off', () => {
    const c = ctx({ farmModules: [], blocks: [{ species: 'walnut' }] });
    expect(isCropPackActiveForFarm('walnut_blight', c)).toBe(true);
  });

  it('carries legacy chill on walnut, the way useChillPack did', () => {
    const c = ctx({ farmModules: ['blight'] });
    expect(isCropPackActiveForFarm('chill_portions', c)).toBe(true);
  });

  it('offers a pack with no legacy rule when its module is already on', () => {
    expect(isCropPackActiveForFarm('harvest', ctx({ farmModules: ['harvest'] }))).toBe(true);
    expect(isCropPackActiveForFarm('harvest', ctx({ farmModules: ['water'] }))).toBe(false);
  });
});

describe('activeCropPacks', () => {
  it('answers for every catalog pack, so callers never key on a pack id', () => {
    const map = activeCropPacks(ctx({ farmModules: ['blight'] }));

    expect(map.walnut_blight).toBe(true);
    expect(map.chill_portions).toBe(true);
    expect(map.harvest).toBe(false);
  });

  it('feeds packModulesToExclude the same answer the hardcoded map used to', () => {
    const c = ctx({ farmModules: ['blight', 'harvest'] });
    const hardcoded = packModulesToExclude(
      c.packs,
      { walnut_blight: true, chill_portions: true },
      [...c.farmModules]
    );

    expect(packModulesToExclude(c.packs, activeCropPacks(c), [...c.farmModules])).toEqual(
      hardcoded
    );
  });

  it('excludes a pack the farm has no claim to', () => {
    const c = ctx({ farmModules: [] });
    expect(packModulesToExclude(c.packs, activeCropPacks(c), [...c.farmModules])).toContain(
      'blight'
    );
  });
});
