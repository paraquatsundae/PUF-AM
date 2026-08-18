/**
 * Whether the chill portions crop pack is active on this farm.
 * Falls back to legacy eligibility when cropPacks has not been migrated yet.
 */
import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { farmShowsChillPortions } from '../../shared/farm/farmTypes';
import { isPackActive, isPackInstalled } from '../../shared/farm/cropPacks';
import { useWalnutPack } from './useWalnutPack';

export function useChillPack(): boolean {
  const { farmCropPacks } = useAuth();
  const { settings } = useFarmDiary();
  const { blocks } = useMapStore();
  const walnutPackActive = useWalnutPack();

  return useMemo(() => {
    if (isPackInstalled(farmCropPacks, 'chill_portions')) {
      return isPackActive(farmCropPacks, 'chill_portions');
    }
    return farmShowsChillPortions({
      profile: settings.farmProfile,
      blocks,
      walnutPackActive,
    });
  }, [farmCropPacks, settings.farmProfile, blocks, walnutPackActive]);
}
