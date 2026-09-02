/**
 * Whether the chill portions crop pack is active on this farm.
 *
 * For the pack's own components to ask about themselves. Core screens should
 * use `useCropPackActivation()` and stay pack-agnostic — the eligibility rules
 * moved to `shared/farm/cropPackActivation.ts`.
 */
import { CHILL_PORTIONS_PACK_ID } from '../../shared/farm/chillPortionsPackage';
import { useCropPackActivation } from './useCropPackActivation';

export function useChillPack(): boolean {
  return useCropPackActivation()[CHILL_PORTIONS_PACK_ID] ?? false;
}
