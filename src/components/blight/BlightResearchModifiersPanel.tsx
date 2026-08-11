/**
 * Collapsible research / sandbox knobs on Blight risk → Sandbox (BE-03).
 * Live-edits CalibrationParams for the sandbox engine; Deploy merge-writes
 * research fields only into farms/{id}/settings/model_params.
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, OperationType } from '../../contexts/AuthContext';
import type { CalibrationParams } from '../../lib/blightModel';
import {
  DEFAULT_MODEL_PARAMS,
  defaultResearchModelParams,
  pickResearchModelParams,
  type ModelParameters,
} from '../../lib/modelParameters';
import { BlightEngineSettings } from './BlightEngineSettings';

function calibToModelParams(calib: CalibrationParams): ModelParameters {
  return {
    ...DEFAULT_MODEL_PARAMS,
    blightSensitivity: calib.blightSensitivity,
    cropCoefficient: calib.cropCoefficient,
    gddBaseTemp: calib.gddBaseTemp,
    humidityGradientFactor: calib.humidityGradientFactor,
    splashMultiplier: calib.splashMultiplier,
    chemRainWashoffRate: calib.chemRainWashoffRate,
    bioColonizationEff: calib.bioColonizationEff,
    bioFavorableGrowthRate: calib.bioFavorableGrowthRate,
    bioEnvDegradationCoef: calib.bioEnvDegradationCoef,
    springStartingInoculum: calib.springStartingInoculum,
    orchardInoculumLevel: calib.orchardInoculumLevel,
    latencyGDDThreshold: calib.latencyGDDThreshold,
    secondarySpreadMultiplier: calib.secondarySpreadMultiplier,
    treeHeight: calib.treeHeight,
    canopyWidth: calib.canopyWidth,
    rowSpacing: calib.rowSpacing,
    chemEfficacy: calib.chemEfficacy,
    bioEfficacy: calib.bioEfficacy,
  };
}

function applyResearchToCalib(prev: CalibrationParams, next: ModelParameters): CalibrationParams {
  const research = pickResearchModelParams(next);
  return { ...prev, ...research };
}

export type BlightResearchModifiersPanelProps = {
  farmId: string | undefined;
  calib: CalibrationParams;
  onCalibChange: (next: CalibrationParams) => void;
};

export function BlightResearchModifiersPanel({
  farmId,
  calib,
  onCalibChange,
}: BlightResearchModifiersPanelProps) {
  const [open, setOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const params = useMemo(() => calibToModelParams(calib), [calib]);

  const handleDeploy = async () => {
    if (!farmId) {
      setMessage({ type: 'error', text: 'No farm selected — cannot save research knobs.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(
        doc(db, 'farms', farmId, 'settings', 'model_params'),
        pickResearchModelParams(params),
        { merge: true }
      );
      setIsLocked(true);
      setMessage({ type: 'success', text: 'Research knobs saved. Sandbox what-ifs only — Ji charts unchanged.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save research knobs. Check admin permissions.' });
      try {
        handleFirestoreError(error, OperationType.WRITE, `farms/${farmId}/settings/model_params`);
      } catch {
        // already logged
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">Research modifiers</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Sandbox-only knobs (sensitivity, splash, latency, canopy, chem/bio). Does not change Forecast /
            Historical.
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 sm:px-4 py-4 bg-slate-50/60">
          <BlightEngineSettings
            params={params}
            onParamsChange={(next) => onCalibChange(applyResearchToCalib(calib, next))}
            isLocked={isLocked}
            onToggleLock={() => setIsLocked((v) => !v)}
            onDeploy={handleDeploy}
            onResetDefaults={() => {
              if (
                window.confirm(
                  'Reset sandbox research knobs to defaults? Deploy to persist. Orchard inoculum and market costs are not changed.'
                )
              ) {
                onCalibChange(applyResearchToCalib(calib, {
                  ...params,
                  ...defaultResearchModelParams(),
                }));
              }
            }}
            saving={saving}
            message={message}
          />
        </div>
      )}
    </div>
  );
}
