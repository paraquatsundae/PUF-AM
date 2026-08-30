/**
 * Production Ji orchard inoculum (k) — lives on Blight Risk for farm admins (BE-02).
 * Writes `orchardInoculumLevel` into farms/{id}/settings/model_params with merge.
 */
import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreErrors';
import { kFromInoculumLevel } from '../../../shared/weather/jiBlightModel';
import type { OrchardInoculumLevel } from '../../lib/modelParameters';

const OPTIONS = [
  { id: 'low' as const, label: 'Low', k: '0.5×' },
  { id: 'medium' as const, label: 'Medium', k: '1.0×' },
  { id: 'high' as const, label: 'High', k: '2.0×' },
];

export type BlightOrchardInoculumPanelProps = {
  farmId: string | undefined;
  level: OrchardInoculumLevel;
  /** Optimistic local update so charts refresh before the snapshot round-trips. */
  onLevelChange: (level: OrchardInoculumLevel) => void;
  canEdit: boolean;
};

export function BlightOrchardInoculumPanel({
  farmId,
  level,
  onLevelChange,
  canEdit,
}: BlightOrchardInoculumPanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = level ?? 'medium';
  const k = kFromInoculumLevel(active);

  const save = async (next: OrchardInoculumLevel) => {
    if (!canEdit || !farmId || next === active || saving) return;
    setSaving(true);
    setError(null);
    onLevelChange(next);
    try {
      await setDoc(
        doc(db, 'farms', farmId, 'settings', 'model_params'),
        { orchardInoculumLevel: next },
        { merge: true }
      );
    } catch (err) {
      onLevelChange(active);
      setError('Could not save inoculum. Check you are signed in as a farm admin.');
      try {
        handleFirestoreError(err, OperationType.WRITE, `farms/${farmId}/settings/model_params`);
      } catch {
        // already logged
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Orchard inoculum (Ji k)</h2>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 max-w-xl">
            Only farm-tunable term on Forecast / Historical / Dashboard. Medium = baseline (k = {k}).
            Set from prior-season blight or bud CFU — workshop default until bud-CFU calibration.
          </p>
        </div>
        {saving && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 max-w-md">
        {OPTIONS.map((opt) => {
          const isActive = active === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!canEdit || saving}
              onClick={() => void save(opt.id)}
              className={clsx(
                'flex flex-col items-center py-2 rounded-lg border text-xs font-bold transition-colors disabled:cursor-not-allowed',
                isActive
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100',
                !canEdit && 'opacity-80'
              )}
            >
              {opt.label}
              <span className={clsx('text-[9px] font-mono', isActive ? 'text-slate-300' : 'text-slate-500')}>
                {opt.k}
              </span>
            </button>
          );
        })}
      </div>

      {!canEdit && (
        <p className="text-[10px] text-slate-400">Farm admins can change this. Current value is shown read-only.</p>
      )}
      {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}
    </div>
  );
}
