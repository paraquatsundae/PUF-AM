/**
 * Farm admin crop-pack lifecycle: Install / Activate / Deactivate / Delete.
 * See Plans/CROP_PACK_PLUGIN.md.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Package, Trash2 } from 'lucide-react';
import {
  isPackActive,
  isPackInstalled,
  listCropPacks,
  type CropPackId,
  type CropPackLifecycleCtx,
} from '../../shared/farm/cropPacks';
import { useAuth } from '../contexts/AuthContext';
import { useFarmDiary, resolveFarmProfile } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import {
  activateCropPack,
  deactivateCropPack,
  deleteCropPack,
  ensureLegacyWalnutPackMigrated,
  installCropPack,
} from '../lib/cropPackLifecycle';
import { WALNUT_BLIGHT_PRIMARY_PATH } from '../packs/walnut_blight';
import { clsx } from 'clsx';

export function CropPacksCard() {
  const { isAdmin, userData, farmCropPacks, farmEnabledModules, refreshFarmModules, refreshFarmCropPacks } =
    useAuth();
  const { settings } = useFarmDiary();
  const { blocks, loadData, isLoaded } = useMapStore();
  const farmId = userData?.farmId;

  const [busyId, setBusyId] = useState<CropPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  const profile = useMemo(
    () =>
      settings.farmProfile && typeof settings.farmProfile === 'object'
        ? resolveFarmProfile(settings.farmProfile)
        : undefined,
    [settings.farmProfile]
  );

  const ctx: CropPackLifecycleCtx | null = farmId
    ? { farmId, profile, blocks }
    : null;

  useEffect(() => {
    if (farmId && !isLoaded) void loadData(farmId);
  }, [farmId, isLoaded, loadData]);

  useEffect(() => {
    if (!ctx || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setMigrating(true);
      try {
        const result = await ensureLegacyWalnutPackMigrated(ctx);
        if (cancelled) return;
        if (result.migrated) {
          await refreshFarmModules();
          await refreshFarmCropPacks();
          setMessage('Walnut blight pack restored from this farm’s existing setup.');
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[CropPacks] legacy migrate failed:', e);
        }
      } finally {
        if (!cancelled) setMigrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per farm when admin opens the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount/farmId migrate
  }, [farmId, isAdmin]);

  const refresh = useCallback(async () => {
    await refreshFarmModules();
    await refreshFarmCropPacks();
  }, [refreshFarmModules, refreshFarmCropPacks]);

  const run = async (packId: CropPackId, action: () => Promise<unknown>, okText: string) => {
    if (!ctx) return;
    setBusyId(packId);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(okText);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pack action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-emerald-700" />
          Crop packs
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Only farm admins can install or remove crop packs.
        </p>
      </div>
    );
  }

  const packs = listCropPacks();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-emerald-700" />
          Crop packs
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
          Install optional tools for this farm. Deactivate hides them but keeps settings; Delete
          removes pack settings. Fine-grained nav toggles stay under{' '}
          <Link to="/farm-management" className="text-emerald-700 underline-offset-2 hover:underline">
            Farm management → Modules
          </Link>
          .
        </p>
      </div>

      {migrating && (
        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking existing walnut setup…
        </p>
      )}

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {message && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          {message}
        </div>
      )}

      <div className="space-y-2">
        {packs.map((pack) => {
          const installed = isPackInstalled(farmCropPacks, pack.id);
          const active = isPackActive(farmCropPacks, pack.id);
          const check = ctx ? pack.canInstall?.(ctx) : undefined;
          const busy = busyId === pack.id;
          const statusLabel = !installed ? 'Not installed' : active ? 'Active' : 'Inactive';

          return (
            <div
              key={pack.id}
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{pack.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{pack.blurb}</p>
                </div>
                <span
                  className={clsx(
                    'shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
                    !installed && 'bg-slate-100 text-slate-600',
                    installed && active && 'bg-emerald-100 text-emerald-800',
                    installed && !active && 'bg-amber-100 text-amber-900'
                  )}
                >
                  {statusLabel}
                </span>
              </div>

              {check?.hint && !installed && (
                <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                  {check.hint}
                </p>
              )}

              {installed && active && pack.id === 'walnut_blight' && farmEnabledModules.includes('blight') && (
                <p className="text-[10px] text-slate-500">
                  Open{' '}
                  <Link
                    to={WALNUT_BLIGHT_PRIMARY_PATH}
                    className="text-emerald-700 underline-offset-2 hover:underline"
                  >
                    Blight Risk
                  </Link>{' '}
                  for orchard inoculum and engine settings.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {!installed && (
                  <button
                    type="button"
                    disabled={busy || Boolean(check?.hard && !check.ok)}
                    onClick={() =>
                      void run(
                        pack.id,
                        () => installCropPack(ctx!, pack.id),
                        `${pack.label} installed and active.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Install
                  </button>
                )}
                {installed && !active && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        pack.id,
                        () => activateCropPack(ctx!, pack.id),
                        `${pack.label} activated.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-semibold disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Activate
                  </button>
                )}
                {installed && active && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        pack.id,
                        () => deactivateCropPack(ctx!, pack.id),
                        `${pack.label} deactivated — settings kept.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-[11px] font-semibold disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Deactivate
                  </button>
                )}
                {installed && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete ${pack.label} from this farm?\n\nRemoves pack settings for this farm. Diary and map data are not deleted. This cannot be undone.`
                        )
                      ) {
                        return;
                      }
                      void run(
                        pack.id,
                        () => deleteCropPack(ctx!, pack.id),
                        `${pack.label} deleted from this farm.`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
