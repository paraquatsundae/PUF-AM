/**
 * Farm `settings/model_params` shape — shared by Settings → Advanced and the
 * blight engine pack surface (Plans/BLIGHT_ENGINE_PLUGIN.md).
 *
 * BE-05 will eventually converge this with Sandbox `CalibrationParams`; until
 * then keep field names stable so Firestore docs round-trip unchanged.
 */

export type OrchardInoculumLevel = 'low' | 'medium' | 'high';

export interface ModelParameters {
  blightSensitivity: number;
  cropCoefficient: number;
  gddBaseTemp: number;
  humidityGradientFactor: number;
  splashMultiplier: number;
  chemRainWashoffRate: number;
  bioColonizationEff: number;
  bioFavorableGrowthRate: number;
  bioEnvDegradationCoef: number;
  springStartingInoculum: number;
  orchardInoculumLevel: OrchardInoculumLevel;
  latencyGDDThreshold: number;
  secondarySpreadMultiplier: number;
  treeHeight: number;
  canopyWidth: number;
  rowSpacing: number;
  chemEfficacy: number;
  bioEfficacy: number;
  marketPrice: number;
  harvestCostPerKg: number;
  waterCostPerML: number;
}

export const DEFAULT_MODEL_PARAMS: ModelParameters = {
  blightSensitivity: 0.85,
  cropCoefficient: 1.15,
  gddBaseTemp: 10.0,
  humidityGradientFactor: 1.2,
  splashMultiplier: 1.5,
  chemRainWashoffRate: 0.05,
  bioColonizationEff: 0.75,
  bioFavorableGrowthRate: 1.1,
  bioEnvDegradationCoef: 0.75,
  springStartingInoculum: 0.02,
  orchardInoculumLevel: 'medium',
  latencyGDDThreshold: 120.0,
  secondarySpreadMultiplier: 1.0,
  treeHeight: 4.5,
  canopyWidth: 4.0,
  rowSpacing: 7.0,
  chemEfficacy: 95,
  bioEfficacy: 30,
  marketPrice: 3.3,
  harvestCostPerKg: 0.45,
  waterCostPerML: 150,
};

/** Sandbox / research knobs — not Ji production inoculum, not market economics. */
export const RESEARCH_MODEL_PARAM_KEYS = [
  'blightSensitivity',
  'cropCoefficient',
  'gddBaseTemp',
  'humidityGradientFactor',
  'splashMultiplier',
  'chemRainWashoffRate',
  'bioColonizationEff',
  'bioFavorableGrowthRate',
  'bioEnvDegradationCoef',
  'springStartingInoculum',
  'latencyGDDThreshold',
  'secondarySpreadMultiplier',
  'treeHeight',
  'canopyWidth',
  'rowSpacing',
  'chemEfficacy',
  'bioEfficacy',
] as const satisfies ReadonlyArray<keyof ModelParameters>;

export type ResearchModelParamKey = (typeof RESEARCH_MODEL_PARAM_KEYS)[number];

export type ResearchModelParams = Pick<ModelParameters, ResearchModelParamKey>;

export const ECONOMICS_MODEL_PARAM_KEYS = [
  'marketPrice',
  'harvestCostPerKg',
  'waterCostPerML',
] as const satisfies ReadonlyArray<keyof ModelParameters>;

export type EconomicsModelParams = Pick<
  ModelParameters,
  (typeof ECONOMICS_MODEL_PARAM_KEYS)[number]
>;

export function pickResearchModelParams(params: ModelParameters): ResearchModelParams {
  const out = {} as ResearchModelParams;
  for (const key of RESEARCH_MODEL_PARAM_KEYS) {
    out[key] = params[key] as never;
  }
  return out;
}

export function pickEconomicsModelParams(params: ModelParameters): EconomicsModelParams {
  return {
    marketPrice: params.marketPrice,
    harvestCostPerKg: params.harvestCostPerKg,
    waterCostPerML: params.waterCostPerML,
  };
}

export function defaultResearchModelParams(): ResearchModelParams {
  return pickResearchModelParams(DEFAULT_MODEL_PARAMS);
}

export function defaultEconomicsModelParams(): EconomicsModelParams {
  return pickEconomicsModelParams(DEFAULT_MODEL_PARAMS);
}
