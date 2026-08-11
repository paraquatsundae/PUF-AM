/**
 * Whether the walnut blight crop pack is active on this farm.
 * Falls back to legacy eligibility when cropPacks has not been migrated yet.
 */
import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { farmHasWalnutPack } from '../../shared/farm/farmTypes';
import { isPackActive, isPackInstalled } from '../../shared/farm/cropPacks';

export function useWalnutPack(): boolean {
  const { farmEnabledModules, farmCropPacks } = useAuth();
  const { settings } = useFarmDiary();
  const { blocks } = useMapStore();

  return useMemo(() => {
    if (isPackInstalled(farmCropPacks, 'walnut_blight')) {
      return isPackActive(farmCropPacks, 'walnut_blight');
    }
    // Legacy until Crop packs card migrates the farm.
    return farmHasWalnutPack({
      profile: settings.farmProfile,
      blocks,
      blightModuleEnabled: farmEnabledModules.includes('blight'),
    });
  }, [farmCropPacks, settings.farmProfile, blocks, farmEnabledModules]);
}
