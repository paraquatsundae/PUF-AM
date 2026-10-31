import { useMemo, useState } from 'react';
import {
  capacityChangeError,
  formatFillPercent,
  formatMoisture,
  formatTonnes,
  planTransfer,
  type FieldBinDirection,
  type FieldBinMovement,
  type FieldBinPercentBase,
  type FieldBinSettings,
  type FieldBinVehicleKind,
} from '../../../shared/farm/fieldBinStock';
import { findBlockIdAtPoint } from '../../../src/lib/farmMapHit';
import type { InfrastructurePin, OrchardBlock } from '../../../src/lib/mapStore';

/** Tap a field bin: tip grain in, take it out, or open this bin’s status. */
export function FieldBinTripSheet({
  pin,
  blocks,
  settings,
  stock,
  disabled,
  onClose,
  onCommit,
  onSaveBin,
  onAddVehicle,
  onUnpin,
}: {
  pin: InfrastructurePin;
  blocks: OrchardBlock[];
  settings: FieldBinSettings;
  stock: Record<string, { tonnes: number; moisture: number | null }>;
  disabled: boolean;
  onClose: () => void;
  onCommit: (draft: {
    vehicleId: string;
    direction: FieldBinDirection;
    moisture?: number;
    lines: { binId: string; percent: number; base: FieldBinPercentBase }[];
  }) => Promise<{ ok: boolean; error?: string; movement?: FieldBinMovement }>;
  onSaveBin: (capacityT: number, cropLabel: string) => void;
  onAddVehicle: (kind: FieldBinVehicleKind, name: string, capacityT: number) => void;
  onUnpin: () => void;
}) {
  const record = settings.bins[pin.id];
  const held = stock[pin.id];
  const paddockId = findBlockIdAtPoint(blocks, pin.lat, pin.lng);
  const paddock = blocks.find((block) => block.id === paddockId)?.name;
  const [direction, setDirection] = useState<FieldBinDirection>('in');
  const [vehicleId, setVehicleId] = useState(settings.vehicles[0]?.id ?? '');
  const [percent, setPercent] = useState('100');
  const [base, setBase] = useState<FieldBinPercentBase>('load');
  const [moisture, setMoisture] = useState('');
  const [capacity, setCapacity] = useState(record ? String(record.capacityT) : '');
  const [crop, setCrop] = useState(record?.cropLabel ?? '');
  const [showStatus, setShowStatus] = useState(false);
  const [unpinAsk, setUnpinAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKind, setNewKind] = useState<FieldBinVehicleKind>('chaser');
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');

  const vehicle = settings.vehicles.find((row) => row.id === vehicleId) ?? settings.vehicles[0];

  const preview = useMemo(() => {
    if (!record || !vehicle) return null;
    return planTransfer({
      vehicleCapacityT: vehicle.capacityT,
      direction,
      moisture: moisture === '' ? undefined : Number(moisture),
      lines: [{ binId: pin.id, percent: Number(percent), base }],
      bins: {
        [pin.id]: {
          tonnes: held?.tonnes ?? 0,
          capacityT: record.capacityT,
          moisture: held?.moisture ?? null,
        },
      },
    });
  }, [record, vehicle, direction, moisture, percent, base, pin.id, held]);

  const saveCapacity = () => {
    const capacityT = Number(capacity);
    const problem = capacityChangeError(held?.tonnes ?? 0, capacityT);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSaveBin(capacityT, crop.trim());
  };

  const addVehicle = () => {
    const capacityT = Number(newCapacity);
    if (!newName.trim() || !Number.isFinite(capacityT) || capacityT <= 0) return;
    onAddVehicle(newKind, newName.trim(), capacityT);
    setNewName('');
    setNewCapacity('');
  };

  const saveTrip = async () => {
    if (!vehicle) return;
    setBusy(true);
    setSaved(null);
    try {
      const result = await onCommit({
        vehicleId: vehicle.id,
        direction,
        moisture: moisture === '' ? undefined : Number(moisture),
        lines: [{ binId: pin.id, percent: Number(percent), base }],
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not save that trip.');
        return;
      }
      setError(null);
      const tonnes = result.movement?.lines.reduce((sum, line) => sum + line.tonnes, 0) ?? 0;
      setSaved(
        `${formatTonnes(tonnes)} ${direction === 'in' ? 'tipped in' : 'loaded out'}.`
      );
    } catch {
      setError('Could not save that trip.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="absolute inset-x-2 bottom-2 z-[700] max-h-[58%] overflow-auto rounded-2xl bg-white shadow-2xl border border-slate-200 p-3"
      aria-label={`${pin.name || 'Field bin'} load`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900 truncate">{pin.name || 'Field bin'}</h2>
          <p className="text-xs text-slate-500">{paddock || 'No paddock'}</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 px-2 py-1">
          Close
        </button>
      </div>

      {!record ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-600">Set how many tonnes this bin holds.</p>
          <label className="block text-xs text-slate-600">
            Capacity (t)
            <input
              type="number"
              min={0}
              step="0.1"
              value={capacity}
              disabled={disabled}
              onChange={(event) => setCapacity(event.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-base"
            />
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={saveCapacity}
            className="w-full py-3 rounded-xl bg-amber-700 text-white text-sm font-semibold"
          >
            Save capacity
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('in')}
              className={`py-3 rounded-xl text-sm font-semibold ${direction === 'in' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              In
            </button>
            <button
              type="button"
              onClick={() => setDirection('out')}
              className={`py-3 rounded-xl text-sm font-semibold ${direction === 'out' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              Out
            </button>
          </div>

          {settings.vehicles.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Add the chaser or truck that is here.</p>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newKind}
                  onChange={(event) => setNewKind(event.target.value as FieldBinVehicleKind)}
                  className="px-2 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="chaser">Chaser</option>
                  <option value="truck">Truck</option>
                </select>
                <input
                  value={newName}
                  placeholder="Name"
                  onChange={(event) => setNewName(event.target.value)}
                  className="px-2 py-2 border border-slate-200 rounded-xl text-sm"
                />
                <input
                  value={newCapacity}
                  type="number"
                  min={0}
                  placeholder="t"
                  onChange={(event) => setNewCapacity(event.target.value)}
                  className="px-2 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={addVehicle}
                className="w-full py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold"
              >
                Add vehicle
              </button>
            </div>
          ) : (
            <>
              <label className="block text-xs text-slate-600">
                Vehicle
                <select
                  value={vehicle?.id ?? ''}
                  disabled={disabled}
                  onChange={(event) => setVehicleId(event.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  {settings.vehicles.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.kind === 'truck' ? 'Truck' : 'Chaser'} · {row.name} ({formatTonnes(row.capacityT)})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-600">
                  Percent
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={percent}
                    disabled={disabled}
                    onChange={(event) => setPercent(event.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-base"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Of
                  <select
                    value={base}
                    disabled={disabled}
                    onChange={(event) => setBase(event.target.value as FieldBinPercentBase)}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                  >
                    <option value="load">the vehicle load</option>
                    <option value="bin">the grain in the bin</option>
                  </select>
                </label>
              </div>
              {direction === 'in' && (
                <label className="block text-xs text-slate-600">
                  Moisture (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={moisture}
                    disabled={disabled}
                    onChange={(event) => setMoisture(event.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-base"
                  />
                </label>
              )}
              {preview?.ok && (
                <p className="text-sm text-slate-600">
                  {formatTonnes(preview.lines[0]?.tonnes ?? 0)}
                  {preview.mixMoisture != null ? ` · mix ${formatMoisture(preview.mixMoisture)}` : ''}
                </p>
              )}
              <button
                type="button"
                disabled={disabled || busy || !preview?.ok}
                onClick={() => void saveTrip()}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40"
              >
                Save
              </button>
            </>
          )}
        </div>
      )}

      {(error || (preview && preview.ok === false)) && (
        <p className="mt-2 text-sm text-rose-600">{error || (preview && preview.ok === false ? preview.error : '')}</p>
      )}
      {saved && <p className="mt-2 text-sm text-emerald-700">{saved}</p>}

      <button
        type="button"
        onClick={() => setShowStatus((open) => !open)}
        className="mt-3 w-full py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
      >
        Bin status
      </button>
      {unpinAsk ? (
        <div className="mt-2 rounded-xl border border-slate-200 p-3">
          <p className="text-sm text-slate-700">
            Take {pin.name || 'this bin'} off the map? The name, capacity and grain stay, and you can place it again.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setUnpinAsk(false)}
              className="py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onUnpin}
              className="py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-40"
            >
              Unpin
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setUnpinAsk(true)}
          className="mt-2 w-full py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Unpin
        </button>
      )}
      {showStatus && (
        <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 space-y-1">
          <p>
            Holding {formatTonnes(held?.tonnes ?? 0)}
            {record ? ` / ${formatTonnes(record.capacityT)}` : ''}
          </p>
          <p>Fill {record ? formatFillPercent(held?.tonnes ?? 0, record.capacityT) : '—'}</p>
          <p>Moisture {formatMoisture(held?.moisture)}</p>
          {record?.cropLabel && <p>Crop {record.cropLabel}</p>}
          {pin.notes && <p>{pin.notes}</p>}
          {record && (
            <label className="block text-xs text-slate-500 pt-1">
              Crop
              <input
                value={crop}
                disabled={disabled}
                placeholder="Wheat, canola…"
                onChange={(event) => setCrop(event.target.value)}
                onBlur={saveCapacity}
                className="mt-1 w-full px-2 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </label>
          )}
        </div>
      )}
    </section>
  );
}
