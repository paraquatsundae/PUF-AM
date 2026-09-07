/**
 * The pack's `productionSettings` surface: every Ji term a farm admin can tune on the
 * Forecast / Historical / Dashboard path. Both write to farms/{id}/settings/model_params.
 */
import React from 'react';
import { BlightOrchardInoculumPanel } from './BlightOrchardInoculumPanel';
import { BlightBudbreakPanel } from './BlightBudbreakPanel';
import type { CalibrationParams, OrchardInoculumLevel } from './modelParameters';

export type BlightProductionSettingsPanelProps = {
  farmId: string | undefined;
  calib: CalibrationParams;
  setCalib: React.Dispatch<React.SetStateAction<CalibrationParams>>;
  canEdit: boolean;
};

export function BlightProductionSettingsPanel({
  farmId,
  calib,
  setCalib,
  canEdit,
}: BlightProductionSettingsPanelProps) {
  return (
    <div className="space-y-3">
      <BlightOrchardInoculumPanel
        farmId={farmId}
        level={(calib.orchardInoculumLevel ?? 'medium') as OrchardInoculumLevel}
        canEdit={canEdit}
        onLevelChange={(next) => setCalib((prev) => ({ ...prev, orchardInoculumLevel: next }))}
      />
      <BlightBudbreakPanel
        farmId={farmId}
        month={calib.budbreakMonth}
        day={calib.budbreakDay}
        canEdit={canEdit}
        onBudbreakChange={(next) =>
          setCalib((prev) => ({ ...prev, budbreakMonth: next.month, budbreakDay: next.day }))
        }
      />
    </div>
  );
}
