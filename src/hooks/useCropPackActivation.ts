/**
 * Which crop packs are active on this farm, keyed by pack id.
 *
 * Core's single question about packs. It gathers what the answer depends on —
 * the farm's `cropPacks` map, its enabled modules, the saved profile and the
 * mapped blocks — and lets `activeCropPacks` decide, so no screen has to name a
 * pack to find out whether it applies.
 *
 * A plain map rather than a hook per pack: the rules run in a loop over the
 * catalog, which a hook could not do.
 */
import { useMemo } from 'react';
import { activeCropPacks, type CropPackId } from '../../shared/farm/cropPacks';
import { useAuth } from '../contexts/AuthContext';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';

export function useCropPackActivation(): Partial<Record<CropPackId, boolean>> {
  const { farmEnabledModules, farmCropPacks } = useAuth();
  const { settings } = useFarmDiary();
  const { blocks } = useMapStore();

  return useMemo(
    () =>
      activeCropPacks({
        packs: farmCropPacks,
        farmModules: farmEnabledModules,
        profile: settings.farmProfile,
        blocks,
      }),
    [farmCropPacks, farmEnabledModules, settings.farmProfile, blocks]
  );
}
