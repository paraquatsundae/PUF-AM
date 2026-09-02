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
import { CROP_PACKS, offeredFarmModules } from '../../shared/farm/cropPacks';
import { useAuth } from '../contexts/AuthContext';
import { useCropPackActivation } from './useCropPackActivation';

export function useOfferedFarmModules(): FarmModuleId[] {
  const { farmEnabledModules, farmCropPacks } = useAuth();
  const activePacks = useCropPackActivation();

  return useMemo(() => {
    const extra = CROP_PACKS.filter((pack) => activePacks[pack.id]).flatMap(
      (pack) => pack.modules
    );
    return offeredFarmModules(farmEnabledModules, farmCropPacks, extra);
  }, [farmEnabledModules, farmCropPacks, activePacks]);
}
