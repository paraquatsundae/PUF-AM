/**
 * Farm module catalog plus pack modules that should already be visible.
 *
 * Stored `enabledModules` often lags Install (and used to omit new pack ids).
 * Nav / ModuleRoute must offer every active pack immediately.
 * Walnut / chill extras cover the pre-cropPacks eligibility window only.
 */
import { useMemo } from 'react';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import { offeredFarmModules } from '../../shared/farm/cropPacks';
import { useAuth } from '../contexts/AuthContext';
import { useChillPack } from './useChillPack';
import { useWalnutPack } from './useWalnutPack';

export function useOfferedFarmModules(): FarmModuleId[] {
  const { farmEnabledModules, farmCropPacks } = useAuth();
  const showChill = useChillPack();
  const showWalnut = useWalnutPack();

  return useMemo(() => {
    const extra: FarmModuleId[] = [];
    if (showChill) extra.push('chill');
    if (showWalnut) extra.push('blight');
    return offeredFarmModules(farmEnabledModules, farmCropPacks, extra);
  }, [farmEnabledModules, farmCropPacks, showChill, showWalnut]);
}
