import {
  formatMoisture,
  formatTonnes,
  truckColorId,
  TRUCK_COLOR_IDS,
  type FieldBinVehicle,
  type TruckColorId,
} from '../../../shared/farm/fieldBinStock';

export const TRUCK_PAINT: Record<TruckColorId, { label: string; body: string; cab: string; soft: string; ink: string }> = {
  amber: { label: 'Amber', body: '#d97706', cab: '#92400e', soft: '#fffbeb', ink: '#78350f' },
  red: { label: 'Red', body: '#dc2626', cab: '#991b1b', soft: '#fef2f2', ink: '#7f1d1d' },
  blue: { label: 'Blue', body: '#2563eb', cab: '#1e3a8a', soft: '#eff6ff', ink: '#1e3a8a' },
  green: { label: 'Green', body: '#16a34a', cab: '#14532d', soft: '#f0fdf4', ink: '#14532d' },
  violet: { label: 'Violet', body: '#7c3aed', cab: '#4c1d95', soft: '#f5f3ff', ink: '#4c1d95' },
  orange: { label: 'Orange', body: '#ea580c', cab: '#9a3412', soft: '#fff7ed', ink: '#9a3412' },
  teal: { label: 'Teal', body: '#0d9488', cab: '#134e4a', soft: '#f0fdfa', ink: '#134e4a' },
  slate: { label: 'Slate', body: '#475569', cab: '#1e293b', soft: '#f8fafc', ink: '#1e293b' },
};

export const BIN_LOAD_COLORS = ['#b45309', '#1d4ed8', '#15803d', '#be185d', '#6d28d9', '#0f766e', '#c2410c', '#334155'];

export function binLoadColor(index: number): string {
  return BIN_LOAD_COLORS[index % BIN_LOAD_COLORS.length] ?? '#334155';
}

function trailersOf(truck: FieldBinVehicle) {
  if (truck.trailers?.length) return truck.trailers;
  return [{ id: truck.id, capacityT: truck.capacityT }];
}

/** Side view of the truck: cab plus one block per trailer, in the truck's colour. */
export function FieldBinTruckMark({
  truck,
  index,
  selected,
  held,
  clearDisabled,
  onSelect,
  onAskClear,
  load,
  bins,
}: {
  truck: FieldBinVehicle;
  index: number;
  selected: boolean;
  held: { tonnes: number; moisture: number | null } | undefined;
  clearDisabled: boolean;
  onSelect: () => void;
  onAskClear: () => void;
  /** Blend shares for this truck. Each trailer is painted in the bin's colour. */
  load?: { trailerId: string; binId: string; percent: number }[];
  bins?: { id: string; name: string }[];
}) {
  const paint = TRUCK_PAINT[truckColorId(truck.color, index)];
  const trailers = trailersOf(truck);
  const total = trailers.reduce((sum, trailer) => sum + trailer.capacityT, 0) || 1;
  const tonnes = held?.tonnes ?? 0;
  const named = bins ?? [];
  const colorOf = new Map(named.map((bin, binIndex) => [bin.id, binLoadColor(binIndex)]));
  const shares = (load ?? []).filter((fill) => fill.percent > 0);
  const keyBins = named.filter((bin) => shares.some((fill) => fill.binId === bin.id));
  return (
    <div
      className="w-full min-h-32 rounded-2xl border-2 px-4 py-3 text-left"
      style={{
        backgroundColor: paint.soft,
        borderColor: selected ? paint.body : '#e2e8f0',
        boxShadow: selected ? `0 0 0 3px ${paint.body}` : undefined,
      }}
    >
      <button type="button" aria-pressed={selected} onClick={onSelect} className="w-full text-left">
      <span className="block text-lg font-bold" style={{ color: paint.ink }}>
        {truck.name}
      </span>
      <span className="mt-2 flex items-end gap-1">
        <span className="relative shrink-0 w-16 h-14 rounded-md" style={{ backgroundColor: paint.cab }} aria-hidden>
          <span className="absolute top-1.5 left-1.5 h-4 w-6 rounded-sm bg-white/80" />
        </span>
        {trailers.map((trailer) => {
          const parts = shares.filter((fill) => fill.trailerId === trailer.id);
          const width = `${Math.max(36, Math.round((trailer.capacityT / total) * 180))}px`;
          return (
            <span
              key={trailer.id}
              aria-hidden
              className="flex h-10 shrink-0 overflow-hidden rounded-sm bg-slate-200"
              style={{ width }}
            >
              {parts.length === 0 ? (
                <span className="h-full w-full" style={{ backgroundColor: paint.body }} />
              ) : (
                parts.map((part) => {
                  const whole = Math.round(part.percent);
                  return (
                    <span
                      key={part.binId}
                      className="flex h-full items-center justify-center text-[11px] font-bold text-white"
                      style={{ width: `${whole}%`, backgroundColor: colorOf.get(part.binId) ?? paint.body }}
                    >
                      {whole >= 18 ? `${whole}%` : ''}
                    </span>
                  );
                })
              )}
            </span>
          );
        })}
      </span>
      <span className="mt-2 block text-sm font-semibold" style={{ color: paint.ink }}>
        {formatTonnes(truck.capacityT)} · {trailers.length} {trailers.length === 1 ? 'trailer' : 'trailers'}
      </span>
      <span className="mt-1 block text-sm font-semibold" style={{ color: paint.ink }}>
        {tonnes > 0 ? `Holding ${formatTonnes(tonnes)} · ${formatMoisture(held?.moisture)}` : 'Empty'}
      </span>
      </button>
      {keyBins.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {keyBins.map((bin) => (
            <span key={bin.id} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: paint.ink }}>
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: colorOf.get(bin.id) }} />
              {bin.name}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label={`Clear ${truck.name}`}
        disabled={clearDisabled}
        onClick={onAskClear}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
      >
        Clear
      </button>
    </div>
  );
}

export function TruckColorPicker({
  value,
  disabled,
  onChange,
}: {
  value: TruckColorId;
  disabled: boolean;
  onChange: (color: TruckColorId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TRUCK_COLOR_IDS.map((id) => {
        const paint = TRUCK_PAINT[id];
        const on = id === value;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={paint.label}
            onClick={() => onChange(id)}
            className="h-11 w-11 rounded-full border-2"
            style={{
              backgroundColor: paint.body,
              borderColor: on ? paint.ink : 'transparent',
              boxShadow: on ? `0 0 0 2px white, 0 0 0 4px ${paint.ink}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
