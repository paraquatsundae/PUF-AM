/**
 * Farm `settings/model_params` shape + sandbox calibration slices
 * (Plans/BLIGHT_ENGINE_PLUGIN.md BE-05).
 *
 * Firestore doc = production + research + economics.
 * Sandbox `CalibrationParams` = research + orchard inoculum + session-only
 * engine knobs (Ctrl+Shift+D). Session knobs are never written to Firestore.
 */

export type { OrchardInoculumLevel } from '../../../shared/weather/jiBlightModel';
import type { OrchardInoculumLevel } from '../../../shared/weather/jiBlightModel';
import {
  walnutBlightModelDefaults,
  walnutBlightSessionDefaults,
} from '../../../shared/farm/walnutBlightPackage';
import {
  DEFAULT_ECONOMICS_MODEL_PARAMS,
  type EconomicsModelParams,
} from '../../../src/lib/farmEconomicsParams';

export interface ModelParameters extends EconomicsModelParams {
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
  /** Budbreak month, 0-indexed. Starts Ji's 4-week primary-inoculum window. */
  budbreakMonth: number;
  /** Budbreak day of month, 1-31. */
  budbreakDay: number;
  latencyGDDThreshold: number;
  secondarySpreadMultiplier: number;
  treeHeight: number;
  canopyWidth: number;
  rowSpacing: number;
  chemEfficacy: number;
  bioEfficacy: number;
}

export const DEFAULT_MODEL_PARAMS: ModelParameters = {
  ...walnutBlightModelDefaults,
  ...DEFAULT_ECONOMICS_MODEL_PARAMS,
};

/** Farm-tunable Ji production terms on Forecast / Historical / Dashboard. */
export const PRODUCTION_MODEL_PARAM_KEYS = [
  'orchardInoculumLevel',
  'budbreakMonth',
  'budbreakDay',
] as const satisfies ReadonlyArray<keyof ModelParameters>;

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

export function pickProductionModelParams(params: ProductionModelParams): ProductionModelParams {
  return {
    orchardInoculumLevel: params.orchardInoculumLevel,
    budbreakMonth: params.budbreakMonth,
    budbreakDay: params.budbreakDay,
  };
}

export function defaultResearchModelParams(): ResearchModelParams {
  return pickResearchModelParams(DEFAULT_MODEL_PARAMS);
}

export function defaultCalibrationParams(): CalibrationParams {
  return {
    ...defaultResearchModelParams(),
    ...pickProductionModelParams(DEFAULT_MODEL_PARAMS),
    ...DEFAULT_ENGINE_SESSION,
  };
}

/** Fill economics defaults so BlightEngineSettings can edit research slices. */
export function modelParamsFromCalibration(calib: CalibrationParams): ModelParameters {
  return {
    ...DEFAULT_MODEL_PARAMS,
    ...pickResearchModelParams(calib),
    ...pickProductionModelParams(calib),
  };
}

/** Apply research fields from a ModelParameters edit; keep session + inoculum. */
export function applyResearchToCalibration(
  prev: CalibrationParams,
  next: Pick<ModelParameters, ResearchModelParamKey>
): CalibrationParams {
  return { ...prev, ...pickResearchModelParams(next) };
}
