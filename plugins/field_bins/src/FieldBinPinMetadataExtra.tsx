import { useEffect, useState } from 'react';
import { canWriteFarmData } from '../../../shared/auth/farmModules';
import { isPackActive } from '../../../shared/farm/cropPacks';
import { isFieldBinInfraType } from '../../../shared/farm/infraTypes';
import { FIELD_BINS_PACK_ID } from '../../../shared/farm/fieldBinsPackage';
import {
  capacityChangeError,
  formatMoisture,
  formatTonnes,
} from '../../../shared/farm/fieldBinStock';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useFieldBinData } from '../../../src/hooks/useFieldBinData';
import type { PackPinProps } from '../../../src/packs/types';

/** Pin editor extra — capacity and crop. Core must not import this file. */
export function FieldBinPinMetadataExtra({ pin }: PackPinProps) {
  const { farmCropPacks, userData } = useAuth();
  const farmId = userData?.farmId;
  const canEdit = canWriteFarmData(userData?.role);
  const { settings, stock, writeSettings } = useFieldBinData(farmId, canEdit);
  const record = settings.bins[pin.id];
  const held = stock[pin.id];
  const [capacity, setCapacity] = useState(record ? String(record.capacityT) : '');
  const [crop, setCrop] = useState(record?.cropLabel ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCapacity(record ? String(record.capacityT) : '');
    setCrop(record?.cropLabel ?? '');
    setError(null);
  }, [pin.id, record?.capacityT, record?.cropLabel]);

  if (!isPackActive(farmCropPacks, FIELD_BINS_PACK_ID)) return null;
  if (!isFieldBinInfraType(pin.type)) return null;

  const save = () => {
    const capacityT = Number(capacity);
    const problem = capacityChangeError(held?.tonnes ?? 0, capacityT);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const bins = {
      ...settings.bins,
      [pin.id]: {
        capacityT,
        ...(crop.trim() ? { cropLabel: crop.trim() } : {}),
      },
    };
    void writeSettings({ ...settings, bins });
  };

  return (
    <div className="space-y-2 pt-1 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Field bin</p>
      <p className="text-xs text-slate-500">
        Holding {formatTonnes(held?.tonnes ?? 0)}
        {held?.moisture != null ? ` · ${formatMoisture(held.moisture)}` : ''}
      </p>
      <label className="block text-xs text-slate-600">
        Capacity (t)
        <input
          type="number"
          min={0}
          step="0.1"
          value={capacity}
          disabled={!canEdit}
          onChange={(event) => setCapacity(event.target.value)}
          onBlur={save}
          className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
        />
      </label>
      <label className="block text-xs text-slate-600">
        Crop
        <input
          type="text"
          value={crop}
          disabled={!canEdit}
          placeholder="Wheat, canola…"
          onChange={(event) => setCrop(event.target.value)}
          onBlur={save}
          className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
        />
      </label>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
