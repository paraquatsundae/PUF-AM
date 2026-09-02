/**
 * Whether the walnut blight crop pack is active on this farm.
 *
 * For the pack's own components to ask about themselves. Core screens should
 * use `useCropPackActivation()` and stay pack-agnostic — the eligibility rules
 * moved to `shared/farm/cropPackActivation.ts`.
 */
import { WALNUT_BLIGHT_PACK_ID } from '../../shared/farm/walnutBlightPackage';
import { useCropPackActivation } from './useCropPackActivation';

export function useWalnutPack(): boolean {
  return useCropPackActivation()[WALNUT_BLIGHT_PACK_ID] ?? false;
}
