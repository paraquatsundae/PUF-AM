import { WHEAT_YIELD_PACK_ID } from '../../../shared/farm/wheatYieldPackage';
import { useCropPackActivation } from '../../../src/hooks/useCropPackActivation';

export function useWheatPack(): boolean {
  return useCropPackActivation()[WHEAT_YIELD_PACK_ID] ?? false;
}
