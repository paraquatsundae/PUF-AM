import { useState } from 'react';
import { formatTonnes, type FieldBinVehicle, type FieldBinVehicleKind } from '../../../shared/farm/fieldBinStock';

export function FieldBinVehicles({
  vehicles,
  disabled,
  onChange,
}: {
  vehicles: FieldBinVehicle[];
  disabled: boolean;
  onChange: (next: FieldBinVehicle[]) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <VehicleList kind="chaser" title="Chasers" vehicles={vehicles} disabled={disabled} onChange={onChange} />
      <VehicleList kind="truck" title="Trucks" vehicles={vehicles} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function VehicleList({
  kind,
  title,
  vehicles,
  disabled,
  onChange,
}: {
  kind: FieldBinVehicleKind;
  title: string;
  vehicles: FieldBinVehicle[];
  disabled: boolean;
  onChange: (next: FieldBinVehicle[]) => void;
}) {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const rows = vehicles.filter((row) => row.kind === kind);

  const add = () => {
    const capacityT = Number(capacity);
    if (!name.trim() || !Number.isFinite(capacityT) || capacityT <= 0) return;
    onChange([...vehicles, { id: crypto.randomUUID(), kind, name: name.trim(), capacityT }]);
    setName('');
    setCapacity('');
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 && <p className="text-xs text-slate-400">None yet.</p>}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {row.name} · {formatTonnes(row.capacityT)}
              {row.trailers?.length ? ` · ${row.trailers.length} trailers` : ''}
              {row.scales ? ' · scales' : ''}
            </span>
            <button
              type="button"
              disabled={disabled}
              className="text-xs text-slate-500 px-2 py-1"
              onClick={() => onChange(vehicles.filter((item) => item.id !== row.id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={name}
          disabled={disabled}
          placeholder="Name"
          onChange={(event) => setName(event.target.value)}
          className="flex-1 px-2 py-2 border border-slate-200 rounded-lg text-sm"
        />
        <input
          value={capacity}
          disabled={disabled}
          type="number"
          min={0}
          step="0.1"
          placeholder="t"
          onChange={(event) => setCapacity(event.target.value)}
          className="w-20 px-2 py-2 border border-slate-200 rounded-lg text-sm"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold"
        >
          Add
        </button>
      </div>
    </section>
  );
}
