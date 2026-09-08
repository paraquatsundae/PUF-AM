import { describe, expect, it } from 'vitest';
import { defaultCalibration } from '../plugins/walnut_blight/src/blightModel';
import {
  DEFAULT_ENGINE_SESSION,
  DEFAULT_MODEL_PARAMS,
  applyResearchToCalibration,
  defaultCalibrationParams,
  modelParamsFromCalibration,
  pickResearchModelParams,
} from '../plugins/walnut_blight/src/modelParameters';

describe('modelParameters', () => {
  it('defaults orchard inoculum to medium (Ji k = 1)', () => {
    expect(DEFAULT_MODEL_PARAMS.orchardInoculumLevel).toBe('medium');
  });

  it('keeps sandbox fields on the blight model shape', () => {
    expect(DEFAULT_MODEL_PARAMS.blightSensitivity).toBe(0.85);
    expect(DEFAULT_MODEL_PARAMS.chemEfficacy).toBe(95);
    expect(DEFAULT_MODEL_PARAMS).not.toHaveProperty('marketPrice');
  });

  it('splits research picks without dragging inoculum into research writes', () => {
    const research = pickResearchModelParams(DEFAULT_MODEL_PARAMS);
    expect(research).not.toHaveProperty('orchardInoculumLevel');
    expect(research.blightSensitivity).toBe(0.85);
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

  it('round-trips research edits without clobbering session knobs', () => {
    const calib = defaultCalibrationParams();
    const asModel = modelParamsFromCalibration(calib);
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
  });
});
