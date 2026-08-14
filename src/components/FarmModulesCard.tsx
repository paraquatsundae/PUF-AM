import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import {
  ALWAYS_ON_MODULES,
  MODULE_BLURBS,
  MODULE_LABELS,
  type FarmModuleId,
} from '../../shared/auth/farmModules';
import {
  clampModulesToActivePacks,
  installedPackModuleRows,
  isPackActive,
  isPackInstalled,
  optionalOpsModules,
  packOwningModule,
} from '../../shared/farm/cropPacks';
import { useAuth } from '../contexts/AuthContext';
import { updateFarmModules } from '../lib/invitePinAuth';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';

export function FarmModulesCard() {
  const { farmEnabledModules, farmCropPacks, refreshFarmModules } = useAuth();
  const [selected, setSelected] = useState<FarmModuleId[]>(farmEnabledModules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const opsModules = useMemo(() => optionalOpsModules(), []);
  const packRows = useMemo(
    () => installedPackModuleRows(farmCropPacks),
    [farmCropPacks]
  );
  const walnutInstalled = isPackInstalled(farmCropPacks, 'walnut_blight');
  const walnutActive = isPackActive(farmCropPacks, 'walnut_blight');

  useEffect(() => {
    // Drop pack modules whose pack is inactive / not installed.
    setSelected(clampModulesToActivePacks(farmEnabledModules, farmCropPacks));
  }, [farmEnabledModules, farmCropPacks]);

  const toggle = (id: FarmModuleId) => {
    if (ALWAYS_ON_MODULES.includes(id)) return;
    const pack = packOwningModule(id);
    if (pack && !isPackActive(farmCropPacks, pack.id)) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = clampModulesToActivePacks(selected, farmCropPacks);
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

  const catalogBaseline = clampModulesToActivePacks(farmEnabledModules, farmCropPacks);
  const catalogNext = clampModulesToActivePacks(selected, farmCropPacks);
  const dirty = catalogNext.join(',') !== catalogBaseline.join(',');
  const orphanPackModuleOnFarm = farmEnabledModules.some((id) => {
    const pack = packOwningModule(id);
    return Boolean(pack && !isPackActive(farmCropPacks, pack.id));
  });

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-50 rounded-xl">
          <Layers className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Farm modules</h2>
          <p className="text-sm text-slate-500">
            Choose tools this farm uses. Worker invite PINs can only grant modules you enable here.
            Crop-pack modules are labelled below and stay off until the pack is active in{' '}
            <Link to="/settings?tab=plugins" className="text-emerald-700 underline-offset-2 hover:underline">
              Settings → Plugins
            </Link>
            .
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {orphanPackModuleOnFarm && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Some catalog modules belong to a deactivated or removed crop pack. Save modules to clear
          them, or activate the pack under Settings → Plugins.
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
          {opsModules.map((id) => {
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

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          From crop packs
        </p>
        {packRows.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            No crop packs installed yet.
            {!walnutInstalled && (
              <>
                {' '}
                Install Walnut blight under{' '}
                <Link
                  to="/settings?tab=plugins"
                  className="text-emerald-700 underline-offset-2 hover:underline"
                >
                  Settings → Plugins
                </Link>{' '}
                to offer Blight Risk here.
              </>
            )}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {packRows.map(({ moduleId, pack, active }) => {
              const on = selected.includes(moduleId);
              return (
                <button
                  key={`${pack.id}:${moduleId}`}
                  type="button"
                  disabled={!active}
                  onClick={() => toggle(moduleId)}
                  title={
                    active
                      ? undefined
                      : `${pack.label} is inactive — activate it under Settings → Plugins`
                  }
                  className={clsx(
                    'text-left px-3 py-3 rounded-xl border transition-colors',
                    !active && 'opacity-55 cursor-not-allowed bg-slate-50 border-slate-200',
                    active && on && 'border-emerald-300 bg-emerald-50/60',
                    active && !on && 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{MODULE_LABELS[moduleId]}</p>
                    <span
                      className={clsx(
                        'shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
                        active ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                      )}
                    >
                      From {pack.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{MODULE_BLURBS[moduleId]}</p>
                  {!active && (
                    <p className="text-[10px] text-amber-800 mt-1.5">
                      Pack deactivated —{' '}
                      <Link
                        to="/settings?tab=plugins"
                        className="underline-offset-2 hover:underline font-semibold"
                        onClick={(e) => e.stopPropagation()}
                      >
                        activate in Plugins
                      </Link>
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {walnutInstalled && !walnutActive && packRows.length > 0 && (
          <p className="text-[11px] text-slate-500">
            Blight Risk stays hidden in the nav until Walnut blight is activated.
          </p>
        )}
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
