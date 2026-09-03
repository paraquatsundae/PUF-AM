/**
 * Farm market economics — price, harvest cost, water cost.
 *
 * Core, not pack. These three keys share the `settings/model_params` document
 * with the walnut blight engine's research parameters, which is why they were
 * declared alongside them, but they are farm figures a grower sets on the
 * Settings page whether or not any crop pack is installed.
 *
 * The data already draws this line. A pack's `settingsOwnedKeys` scopes what
 * uninstalling it may delete, and both `cropPackLifecycle.ts` and
 * `shared/farm/pluginPackage.ts` say in as many words that economics must
 * survive removal of the pack. Splitting the types follows the ownership the
 * document already has; it does not move any stored field.
 *
 * Writers use `merge`, so the two slices share the doc without clobbering.
 */

export const ECONOMICS_MODEL_PARAM_KEYS = [
  'marketPrice',
  'harvestCostPerKg',
  'waterCostPerML',
] as const;

export type EconomicsModelParams = {
  marketPrice: number;
  harvestCostPerKg: number;
  waterCostPerML: number;
};

export const DEFAULT_ECONOMICS_MODEL_PARAMS: EconomicsModelParams = {
  marketPrice: 3.3,
  harvestCostPerKg: 0.45,
  waterCostPerML: 150,
};

/** Narrow a whole `model_params` read down to the economics slice. */
export function pickEconomicsModelParams(params: EconomicsModelParams): EconomicsModelParams {
  return {
    marketPrice: params.marketPrice,
    harvestCostPerKg: params.harvestCostPerKg,
    waterCostPerML: params.waterCostPerML,
  };
}

export function defaultEconomicsModelParams(): EconomicsModelParams {
  return { ...DEFAULT_ECONOMICS_MODEL_PARAMS };
}
