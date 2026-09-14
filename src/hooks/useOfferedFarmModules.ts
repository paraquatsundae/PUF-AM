/**
 * Farm module catalog plus pack modules that should already be visible.
 *
 * Stored `enabledModules` often lags Install (and used to omit new pack ids).
 * Nav / ModuleRoute must offer every active pack immediately, so the extras come
 * from whichever packs `useCropPackActivation` reports — including the ones held
 * open by a legacy eligibility rule on a farm that never ran Install.
 */
import { useMemo } from 'react';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import {
  CROP_PACKS,
  FARM_PACKS,
  isFarmFeedActive,
  offeredFarmModules,
} from '../../shared/farm/cropPacks';
import { useAuth } from '../contexts/AuthContext';
import { isWorkshopMode } from '../lib/workshopMode';
import { isMistFarmSessionActive } from '../mist/mistFarmSession';
import { useCropPackActivation } from './useCropPackActivation';

export function useOfferedFarmModules(): FarmModuleId[] {
  const { farmEnabledModules, farmCropPacks } = useAuth();
  const activePacks = useCropPackActivation();

  return useMemo(() => {
    const farmExtra = isFarmFeedActive(farmCropPacks, {
      mistSession: isMistFarmSessionActive(),
      workshop: isWorkshopMode(),
    })
      ? FARM_PACKS.flatMap((pack) => pack.modules)
      : [];
    const extra = [
      ...CROP_PACKS.filter((pack) => activePacks[pack.id]).flatMap((pack) => pack.modules),
      ...farmExtra,
    ];
    return offeredFarmModules(farmEnabledModules, farmCropPacks, extra);
  }, [farmEnabledModules, farmCropPacks, activePacks]);
}
