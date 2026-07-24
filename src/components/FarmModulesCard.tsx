import React, { useEffect, useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import {
  ALWAYS_ON_MODULES,
  MODULE_BLURBS,
  MODULE_LABELS,
  OPTIONAL_MODULES,
  resolveFarmEnabledModules,
  type FarmModuleId,
} from '../../shared/auth/farmModules';
import { useAuth } from '../contexts/AuthContext';
import { updateFarmModules } from '../lib/invitePinAuth';
import { clsx } from 'clsx';

export function FarmModulesCard() {
  const { farmEnabledModules, refreshFarmModules } = useAuth();
  const [selected, setSelected] = useState<FarmModuleId[]>(farmEnabledModules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setSelected(farmEnabledModules);
  }, [farmEnabledModules]);

  const toggle = (id: FarmModuleId) => {
    if (ALWAYS_ON_MODULES.includes(id)) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = resolveFarmEnabledModules(selected);
      await updateFarmModules(next);
      await refreshFarmModules();
      setSelected(next);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save modules');
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    resolveFarmEnabledModules(selected).join(',') !==
    resolveFarmEnabledModules(farmEnabledModules).join(',');

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-50 rounded-xl">
          <Layers className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Farm modules</h2>
          <p className="text-sm text-slate-500">
            Choose tools this orchard uses. Worker invite PINs can only grant modules you enable here.
            Crop-specific tools (e.g. blight) are optional.
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Always on</p>
        <div className="flex flex-wrap gap-2">
          {ALWAYS_ON_MODULES.map((id) => (
            <span
              key={id}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"
            >
              {MODULE_LABELS[id]}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OPTIONAL_MODULES.map((id) => {
            const on = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={clsx(
                  'text-left px-3 py-3 rounded-xl border transition-colors',
                  on
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{MODULE_LABELS[id]}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{MODULE_BLURBS[id]}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save modules
        </button>
        {savedFlash && <span className="text-sm text-emerald-700">Saved</span>}
      </div>
    </div>
  );
}
