import {
  formatFillPercent,
  formatMoisture,
  formatTonnes,
  type FieldBinSettings,
  type FieldBinVehicle,
} from '../../../shared/farm/fieldBinStock';
import { fieldBinPlaces } from '../../../shared/farm/fieldBinPlace';
import { findBlockIdAtPoint } from '../../../src/lib/farmMapHit';
import type { InfrastructurePin, OrchardBlock } from '../../../src/lib/mapStore';
import { FieldBinVehicles } from './FieldBinVehicles';

/** Every field bin, opened from the Storage button. */
export function FieldBinStatusSheet({
  pins,
  blocks,
  settings,
  stock,
  disabled,
  onClose,
  onSelectPin,
  onVehicles,
}: {
  pins: InfrastructurePin[];
  blocks: OrchardBlock[];
  settings: FieldBinSettings;
  stock: Record<string, { tonnes: number; moisture: number | null }>;
  disabled: boolean;
  onClose: () => void;
  onSelectPin: (id: string) => void;
  onVehicles: (vehicles: FieldBinVehicle[]) => void;
}) {
  const bins = fieldBinPlaces(pins, settings);

  return (
    <div className="absolute inset-x-2 top-16 bottom-2 z-[800] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900">Storage</h2>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 px-2 py-1">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-5">
        {bins.length === 0 ? (
          <p className="text-sm text-slate-500">No field bins yet. Drop one on the map.</p>
        ) : (
          <ul className="space-y-2">
            {bins.map((pin) => {
              const record = settings.bins[pin.id];
              const held = stock[pin.id];
              const paddockId = pin.lat == null || pin.lng == null ? null : findBlockIdAtPoint(blocks, pin.lat, pin.lng);
              const paddock = pin.lat == null ? 'Not on the map' : blocks.find((block) => block.id === paddockId)?.name;
              return (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPin(pin.id)}
                    className="w-full text-left rounded-xl border border-slate-200 px-3 py-3 hover:border-amber-400"
                  >
                    <div className="font-semibold text-slate-900">{pin.name || 'Field bin'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {paddock || 'No paddock'}
                      {record?.cropLabel ? ` · ${record.cropLabel}` : ''}
                      {pin.notes ? ` · ${pin.notes}` : ''}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      {formatTonnes(held?.tonnes ?? 0)}
                      {record ? ` / ${formatTonnes(record.capacityT)}` : ''}
                      {' · '}
                      {record ? formatFillPercent(held?.tonnes ?? 0, record.capacityT) : '—'}
                      {' · '}
                      {formatMoisture(held?.moisture)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <FieldBinVehicles vehicles={settings.vehicles} disabled={disabled} onChange={onVehicles} />
      </div>
    </div>
  );
}
