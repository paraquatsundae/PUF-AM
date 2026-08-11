import { describe, expect, it } from 'vitest';
import { defaultCalibration } from '../src/lib/blightModel';
import {
  DEFAULT_ENGINE_SESSION,
  DEFAULT_MODEL_PARAMS,
  applyResearchToCalibration,
  defaultCalibrationParams,
  modelParamsFromCalibration,
  pickEconomicsModelParams,
  pickResearchModelParams,
} from '../src/lib/modelParameters';

describe('modelParameters', () => {
  it('defaults orchard inoculum to medium (Ji k = 1)', () => {
    expect(DEFAULT_MODEL_PARAMS.orchardInoculumLevel).toBe('medium');
  });

  it('keeps sandbox and economics fields on the same doc shape', () => {
    expect(DEFAULT_MODEL_PARAMS.blightSensitivity).toBe(0.85);
    expect(DEFAULT_MODEL_PARAMS.marketPrice).toBe(3.3);
    expect(DEFAULT_MODEL_PARAMS.chemEfficacy).toBe(95);
  });

  it('splits research vs economics picks without dragging inoculum into research writes', () => {
    const research = pickResearchModelParams(DEFAULT_MODEL_PARAMS);
    const economics = pickEconomicsModelParams(DEFAULT_MODEL_PARAMS);
    expect(research).not.toHaveProperty('orchardInoculumLevel');
    expect(research).not.toHaveProperty('marketPrice');
    expect(research.blightSensitivity).toBe(0.85);
    expect(economics).toEqual({
      marketPrice: 3.3,
      harvestCostPerKg: 0.45,
      waterCostPerML: 150,
    });
  });

  it('builds CalibrationParams from one defaults source (no research drift)', () => {
    const calib = defaultCalibrationParams();
    expect(calib.cropCoefficient).toBe(DEFAULT_MODEL_PARAMS.cropCoefficient);
    expect(calib.humidityGradientFactor).toBe(DEFAULT_MODEL_PARAMS.humidityGradientFactor);
    expect(calib.splashMultiplier).toBe(DEFAULT_MODEL_PARAMS.splashMultiplier);
    expect(calib.bioColonizationEff).toBe(DEFAULT_MODEL_PARAMS.bioColonizationEff);
    expect(calib.orchardInoculumLevel).toBe(DEFAULT_MODEL_PARAMS.orchardInoculumLevel);
    expect(calib.cdfBaseWeighting).toBe(DEFAULT_ENGINE_SESSION.cdfBaseWeighting);
    expect(calib.latencyDays).toBe(DEFAULT_ENGINE_SESSION.latencyDays);
    expect(defaultCalibration).toEqual(calib);
  });

  it('round-trips research edits without clobbering session knobs or economics fill', () => {
    const calib = defaultCalibrationParams();
    const asModel = modelParamsFromCalibration(calib);
    expect(asModel.marketPrice).toBe(DEFAULT_MODEL_PARAMS.marketPrice);
    expect(asModel.cropCoefficient).toBe(calib.cropCoefficient);

    const next = applyResearchToCalibration(calib, {
      ...asModel,
      blightSensitivity: 0.5,
      splashMultiplier: 2.0,
    });
    expect(next.blightSensitivity).toBe(0.5);
    expect(next.splashMultiplier).toBe(2.0);
    expect(next.cdfBaseWeighting).toBe(calib.cdfBaseWeighting);
    expect(next.orchardInoculumLevel).toBe(calib.orchardInoculumLevel);
    expect(next).not.toHaveProperty('marketPrice');
  });
});
