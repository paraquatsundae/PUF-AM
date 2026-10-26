export type FieldBinMode = 'map' | 'chaser' | 'truck' | 'bins';

const MODES: { id: FieldBinMode; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'bins', label: 'Bins' },
  { id: 'chaser', label: 'Chaser' },
  { id: 'truck', label: 'Truck' },
];

export function FieldBinModeSwitch({
  mode,
  onChange,
}: {
  mode: FieldBinMode;
  onChange: (mode: FieldBinMode) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={mode === item.id}
          onClick={() => onChange(item.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
            mode === item.id ? 'bg-amber-700 text-white' : 'text-slate-700'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
