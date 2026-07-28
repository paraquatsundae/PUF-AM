/**
 * Whether this farm has the walnut crop pack (blight / chill / Ji docs).
 */
import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { farmHasWalnutPack } from '../../shared/farm/farmTypes';

export function useWalnutPack(): boolean {
  const { farmEnabledModules } = useAuth();
  const { settings } = useFarmDiary();
  const { blocks } = useMapStore();

  return useMemo(
    () =>
      farmHasWalnutPack({
        profile: settings.farmProfile,
        blocks,
        blightModuleEnabled: farmEnabledModules.includes('blight'),
      }),
    [settings.farmProfile, blocks, farmEnabledModules]
  );
}
