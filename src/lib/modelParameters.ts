/**
 * Farm `settings/model_params` shape + sandbox calibration slices
 * (Plans/BLIGHT_ENGINE_PLUGIN.md BE-05).
 *
 * Firestore doc = production + research + economics.
 * Sandbox `CalibrationParams` = research + orchard inoculum + session-only
 * engine knobs (Ctrl+Shift+D). Session knobs are never written to Firestore.
 */

export type { OrchardInoculumLevel } from '../../shared/weather/jiBlightModel';
import type { OrchardInoculumLevel } from '../../shared/weather/jiBlightModel';
import {
  walnutBlightModelDefaults,
  walnutBlightSessionDefaults,
} from '../../shared/farm/walnutBlightPackage';

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
  ...walnutBlightModelDefaults,
  marketPrice: 3.3,
  harvestCostPerKg: 0.45,
  waterCostPerML: 150,
};

/** Ji production inoculum — only farm-tunable Forecast/Historical term. */
export const PRODUCTION_MODEL_PARAM_KEYS = ['orchardInoculumLevel'] as const satisfies ReadonlyArray<
  keyof ModelParameters
>;

export type ProductionModelParams = Pick<
  ModelParameters,
  (typeof PRODUCTION_MODEL_PARAM_KEYS)[number]
>;

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

/**
 * Ctrl+Shift+D / sandbox engine-only knobs. Session state — not part of
 * `settings/model_params` and not merge-saved by Deploy.
 */
export type EngineSessionParams = {
  cdfBaseWeighting: number;
  cdfExponentialEffect: number;
  tempOptimumWeight: number;
  wdCompoundingRate: number;
  chemBaseDecayRate: number;
  /** Reserved for future calendar-latency experiments; core uses GDD. */
  latencyDays: number;
};

export const DEFAULT_ENGINE_SESSION: EngineSessionParams = {
  ...walnutBlightSessionDefaults,
};

/**
 * Runtime shape for Sandbox `runBlightModel` + BlightRisk `calib` state.
 * Research + orchard inoculum share defaults with `ModelParameters`;
 * engine-session fields stay local.
 */
export type CalibrationParams = ResearchModelParams &
  ProductionModelParams &
  EngineSessionParams;

export function pickResearchModelParams(
  params: Pick<ModelParameters, ResearchModelParamKey>
): ResearchModelParams {
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

export function pickProductionModelParams(params: ModelParameters): ProductionModelParams {
  return { orchardInoculumLevel: params.orchardInoculumLevel };
}

export function defaultResearchModelParams(): ResearchModelParams {
  return pickResearchModelParams(DEFAULT_MODEL_PARAMS);
}

export function defaultEconomicsModelParams(): EconomicsModelParams {
  return pickEconomicsModelParams(DEFAULT_MODEL_PARAMS);
}

export function defaultCalibrationParams(): CalibrationParams {
  return {
    ...defaultResearchModelParams(),
    orchardInoculumLevel: DEFAULT_MODEL_PARAMS.orchardInoculumLevel,
    ...DEFAULT_ENGINE_SESSION,
  };
}

/** Fill economics defaults so BlightEngineSettings can edit research slices. */
export function modelParamsFromCalibration(calib: CalibrationParams): ModelParameters {
  return {
    ...DEFAULT_MODEL_PARAMS,
    ...pickResearchModelParams(calib),
    orchardInoculumLevel: calib.orchardInoculumLevel,
  };
}

/** Apply research fields from a ModelParameters edit; keep session + inoculum. */
export function applyResearchToCalibration(
  prev: CalibrationParams,
  next: Pick<ModelParameters, ResearchModelParamKey>
): CalibrationParams {
  return { ...prev, ...pickResearchModelParams(next) };
}
