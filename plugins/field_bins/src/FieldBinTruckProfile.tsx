import { useState } from 'react';
import { truckCapacityT, type FieldBinTrailer, type FieldBinVehicle, type TruckColorId } from '../../../shared/farm/fieldBinStock';
import { TruckColorPicker } from './FieldBinTruckMark';

/** Saved truck shape: name, trailer count, and each trailer's capacity. */
export function FieldBinTruckProfile({
  truck,
  disabled,
  onSave,
  onCancel,
  onRemove,
  colorDefault,
}: {
  truck: FieldBinVehicle | null;
  disabled: boolean;
  colorDefault: TruckColorId;
  onSave: (truck: FieldBinVehicle) => void;
  onCancel?: () => void;
  onRemove?: (id: string) => void;
}) {
  const [name, setName] = useState(truck?.name ?? '');
  const [trailers, setTrailers] = useState<FieldBinTrailer[]>(
    truck?.trailers?.length
      ? truck.trailers
      : [{ id: crypto.randomUUID(), capacityT: truck?.capacityT || 0 }]
  );
  const [color, setColor] = useState<TruckColorId>(truck?.color ?? colorDefault);
  const [error, setError] = useState('');

  const setCount = (count: number) => {
    const n = Math.max(1, Math.min(6, count || 1));
    const next = trailers.slice(0, n);
    while (next.length < n) next.push({ id: crypto.randomUUID(), capacityT: 0 });
    setTrailers(next);
  };

  const save = () => {
    const usable = trailers.filter((trailer) => trailer.capacityT > 0);
    if (!name.trim()) {
      setError('Name the truck.');
      return;
    }
    if (usable.length === 0) {
      setError('Each trailer needs a capacity in tonnes.');
      return;
    }
    onSave({
      id: truck?.id ?? crypto.randomUUID(),
      kind: 'truck',
      name: name.trim(),
      capacityT: truckCapacityT(usable),
      trailers: usable,
      color,
    });
  };

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
      <h2 className="text-sm font-semibold text-slate-800">{truck ? 'Edit profile' : 'New truck profile'}</h2>
      <label className="block text-sm text-slate-600">
        Name
        <input
          value={name}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-xl"
        />
      </label>
      <div className="space-y-1">
        <p className="text-sm text-slate-600">Colour</p>
        <TruckColorPicker value={color} disabled={disabled} onChange={setColor} />
      </div>
      <label className="block text-sm text-slate-600">
        Trailers
        <input
          type="number"
          min={1}
          max={6}
          disabled={disabled}
          value={trailers.length}
          onChange={(event) => setCount(Number(event.target.value))}
          className="mt-1 block w-20 px-3 py-2 border border-slate-200 rounded-xl"
        />
      </label>
      {trailers.map((trailer, index) => (
        <label key={trailer.id} className="block text-sm text-slate-600">
          Trailer {index + 1} capacity (t)
          <input
            type="number"
            min={0}
            step="0.1"
            disabled={disabled}
            value={trailer.capacityT || ''}
            onChange={(event) => {
              const capacityT = Number(event.target.value);
              setTrailers((rows) => rows.map((row) => (row.id === trailer.id ? { ...row, capacityT } : row)));
            }}
            className="mt-1 block w-32 px-3 py-2 border border-slate-200 rounded-xl"
          />
        </label>
      ))}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-amber-700 text-white text-sm font-semibold disabled:opacity-40"
        >
          Save profile
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600">
            Cancel
          </button>
        )}
        {truck && onRemove && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(truck.id)}
            className="ml-auto px-3 py-2 text-sm text-slate-500"
          >
            Remove
          </button>
        )}
      </div>
    </section>
  );
}
