import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { safetyApi } from '../services/api';
import { cn } from '../lib/utils';

export type SafetyItem = { id: string; text: string; required?: boolean };

type Props = {
  farmId: string;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function SafetyAcceptModal({
  farmId,
  title = 'Safety checklist',
  subtitle = 'Confirm required checks before starting this work.',
  confirmLabel = 'Accept & start',
  onCancel,
  onConfirm,
}: Props) {
  const [items, setItems] = useState<SafetyItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const checklist = await safetyApi.getChecklist(farmId);
        const list = checklist?.items?.length
          ? checklist.items
          : [
              { id: 'ppe', text: 'PPE on and fit for task', required: true },
              { id: 'equipment', text: 'Equipment checked and safe', required: true },
              { id: 'comms', text: 'Comms device charged and working', required: true },
            ];
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) {
          setItems([
            { id: 'ppe', text: 'PPE on and fit for task', required: true },
            { id: 'equipment', text: 'Equipment checked and safe', required: true },
            { id: 'comms', text: 'Comms device charged and working', required: true },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  const requiredOk = items
    .filter((i) => i.required !== false)
    .every((i) => checked[i.id]);

  const handleConfirm = async () => {
    if (!requiredOk) return;
    setSaving(true);
    try {
      await onConfirm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={(e) =>
                        setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))
                      }
                      className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-800">
                      {item.text}
                      {item.required !== false && (
                        <span className="ml-1 text-[10px] font-bold uppercase text-rose-500">
                          Required
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!requiredOk || loading || saving}
              onClick={() => void handleConfirm()}
              className={cn(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white inline-flex items-center justify-center gap-2',
                requiredOk ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed'
              )}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
