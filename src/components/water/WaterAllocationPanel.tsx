import React, { useEffect, useState } from 'react';
import { CheckCircle2, Droplets, Save } from 'lucide-react';
import { useFarmDiary, type IrrigationSystemType } from '../../lib/farmDiary';
import { useMapStore } from '../../lib/mapStore';

const IRRIGATION_OPTIONS: { value: IrrigationSystemType; label: string }[] = [
  { value: 'micro', label: 'Micro-sprinkler' },
  { value: 'surface_drip', label: 'Surface drip' },
  { value: 'sub_surface', label: 'Subsurface drip (SDI)' },
  { value: 'flood', label: 'Flood / furrow' },
];

const fieldClass =
  'bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-400 w-full';

/** Seasonal allocation + irrigation method — was Farm setup; now the water pack surface. */
export function WaterAllocationPanel() {
  const { settings, updateSettings, canEdit } = useFarmDiary();
  const { totalAreaHa } = useMapStore();
  const [waterAllocationMl, setWaterAllocationMl] = useState(500);
  const [irrigationSystemType, setIrrigationSystemType] =
    useState<IrrigationSystemType>('micro');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setIrrigationSystemType(settings.irrigationSystemType || 'micro');
    if (typeof settings.waterAllocationMl === 'number') {
      setWaterAllocationMl(settings.waterAllocationMl);
    }
  }, [settings.irrigationSystemType, settings.waterAllocationMl]);

  const handleSave = () => {
    if (!canEdit) return;
    updateSettings({
      irrigationSystemType,
      waterAllocationMl: Number(waterAllocationMl) || 0,
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-sky-600" />
            Allocation & method
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Seasonal water right and irrigation style. Used by the budget on this page and blight.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[11px] font-semibold disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
          {savedFlash && (
            <span className="text-[11px] font-medium text-emerald-600 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Seasonal allocation</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step="0.1"
              className={fieldClass}
              value={waterAllocationMl}
              disabled={!canEdit}
              onChange={(e) => setWaterAllocationMl(Number(e.target.value))}
            />
            <span className="text-[10px] text-slate-400 shrink-0">ML</span>
          </div>
          {totalAreaHa > 0 && waterAllocationMl > 0 && (
            <span className="text-[10px] text-slate-400">
              ≈ {(waterAllocationMl / totalAreaHa).toFixed(2)} ML/ha over mapped area
            </span>
          )}
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Irrigation method</span>
          <select
            className={fieldClass}
            value={irrigationSystemType}
            disabled={!canEdit}
            onChange={(e) => setIrrigationSystemType(e.target.value as IrrigationSystemType)}
          >
            {IRRIGATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
