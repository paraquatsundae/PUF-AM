const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

function applyKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1);
  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  if (current.replace('.', '').length >= 6) return current;
  if (current === '0') return key;
  return `${current}${key}`;
}

/** Large 0–9 keypad. Enter commits the figure. */
export function FieldBinKeypad({
  label,
  value,
  onChange,
  onEnter,
  onClose,
  error,
  onFull,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onEnter: () => void;
  onClose: () => void;
  error?: string | null;
  /** Sets the bin to its tonne capacity. */
  onFull?: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[900] bg-slate-900/40 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 px-2 py-1">
            Close
          </button>
        </div>
        <p className="mt-1 text-4xl font-bold text-slate-900 tabular-nums min-h-[3rem]">{value || '0'}</p>
        {error && <p className="mt-1 text-sm font-semibold text-rose-600">{error}</p>}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(applyKey(value, key))}
              className="h-16 rounded-2xl bg-slate-100 text-2xl font-semibold text-slate-800 active:bg-slate-200"
            >
              {key}
            </button>
          ))}
        </div>
        {onFull && (
          <button
            type="button"
            onClick={onFull}
            className="mt-2 h-14 w-full rounded-2xl bg-amber-700 text-lg font-bold text-white"
          >
            100%
          </button>
        )}
        <button
          type="button"
          onClick={onEnter}
          className="mt-2 h-16 w-full rounded-2xl bg-indigo-600 text-xl font-bold text-white"
        >
          Enter
        </button>
      </div>
    </div>
  );
}
