/**
 * Whether Farm feed is active on this farm. Kind `farm` is on unless admin
 * wrote inactive. Not a species fallback. Plans/FARM_MESSAGING.md
 */
import { isFarmFeedActive } from '../../../shared/farm/cropPacks';
import { useAuth } from '../../../src/contexts/AuthContext';

export function useFarmFeedPack(): boolean {
  const { farmCropPacks } = useAuth();
  return isFarmFeedActive(farmCropPacks);
}
