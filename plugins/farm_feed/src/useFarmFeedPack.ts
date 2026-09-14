/**
 * Whether Farm feed is active on this farm. Not a species fallback.
 */
import { isFarmFeedActive } from '../../../shared/farm/cropPacks';
import { useAuth } from '../../../src/contexts/AuthContext';
import { isWorkshopMode } from '../../../src/lib/workshopMode';
import { isMistFarmSessionActive } from '../../../src/mist/mistFarmSession';

export function useFarmFeedPack(): boolean {
  const { farmCropPacks } = useAuth();
  return isFarmFeedActive(farmCropPacks, {
    mistSession: isMistFarmSessionActive(),
    workshop: isWorkshopMode(),
  });
}
