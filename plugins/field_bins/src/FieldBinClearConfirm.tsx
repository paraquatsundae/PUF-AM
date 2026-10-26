import { formatMoisture, formatTonnes } from '../../../shared/farm/fieldBinStock';

/** Confirm before emptying a silo, truck, or chaser. */
export function FieldBinClearConfirm({
  name,
  kind,
  tonnes,
  moisture,
  pendingLoad,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  kind: 'bin' | 'vehicle';
  tonnes: number;
  moisture: number | null;
  pendingLoad: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const held =
    tonnes > 0
      ? `This empties ${formatTonnes(tonnes)}${moisture != null ? ` at ${formatMoisture(moisture)}` : ''}.`
      : 'This clears the load on screen.';
  const rest =
    kind === 'bin' ? 'Earlier loads stay in the history.' : tonnes > 0 ? 'Bins are left as they are.' : '';
  const draft = tonnes > 0 && pendingLoad ? 'The load on screen is cleared too.' : '';
  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-bin-clear-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h2 id="field-bin-clear-title" className="text-lg font-bold text-slate-900">
          Clear {name}?
        </h2>
        <p className="mt-2 text-sm text-slate-700">{[held, rest, draft].filter(Boolean).join(' ')}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-slate-800 py-3 font-semibold text-white disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-3 font-semibold text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
