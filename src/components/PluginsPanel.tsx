/**
 * Settings → Plugins — catalog grouped by category.
 * Crop packs: Install / Activate / Deactivate / Delete.
 * Freenet: status + link to Sync (not crop-pack lifecycle).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Package, Plug, Trash2 } from 'lucide-react';
import {
  isPackActive,
  isPackInstalled,
  type CropPackId,
  type CropPackLifecycleCtx,
} from '../../shared/farm/cropPacks';
import {
  groupPluginsByCategory,
  isCropPackPlugin,
  type PluginCatalogEntry,
} from '../../shared/farm/pluginsCatalog';
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
import { activeFarmPipe } from '../lib/farmPipes';
import { isDesktopShell } from '../lib/desktopBridge';
import { apiUrl, isPackagedNativeAndroid } from '../lib/apiBase';
import { clsx } from 'clsx';
import type { PluginPackageManifestV1 } from '../../shared/farm/pluginPackage';

function freenetStatusLabel(): { label: string; tone: 'active' | 'available' | 'hub' } {
  if (activeFarmPipe() === 'freenet') {
    return { label: 'Active on this farm', tone: 'active' };
  }
  if (isPackagedNativeAndroid()) {
    return { label: 'Via laptop hub', tone: 'hub' };
  }
  if (isDesktopShell()) {
    return { label: 'Available on this device', tone: 'available' };
  }
  return { label: 'Not this farm’s storage', tone: 'available' };
}

export function PluginsPanel({
  onOpenSync,
}: {
  /** Switch Settings tab to Sync (Freenet day-to-day controls). */
  onOpenSync?: () => void;
}) {
  const { isAdmin, userData, farmCropPacks, farmEnabledModules, refreshFarmModules, refreshFarmCropPacks } =
    useAuth();
  const { settings } = useFarmDiary();
  const { blocks, loadData, isLoaded } = useMapStore();
  const farmId = userData?.farmId;

  const [busyId, setBusyId] = useState<CropPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [diskPackages, setDiskPackages] = useState<PluginPackageManifestV1[]>([]);
  const [diskError, setDiskError] = useState<string | null>(null);

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

  const catalogIds = useMemo(() => new Set(groups.flatMap((g) => g.entries.map((e) => e.id))), [groups]);
  const extraDiskPackages = useMemo(
    () => diskPackages.filter((pkg) => !catalogIds.has(pkg.id)),
    [diskPackages, catalogIds]
  );
  const diskById = useMemo(() => {
    const map = new Map<string, PluginPackageManifestV1>();
    for (const pkg of diskPackages) map.set(pkg.id, pkg);
    return map;
  }, [diskPackages]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/plugins/packages'));
        if (!res.ok) throw new Error(`Could not list plugins/ (${res.status})`);
        const data = (await res.json()) as { packages?: PluginPackageManifestV1[] };
        if (!cancelled) {
          setDiskPackages(Array.isArray(data.packages) ? data.packages : []);
          setDiskError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setDiskPackages([]);
          setDiskError(e instanceof Error ? e.message : 'Could not list plugins/');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          console.warn('[Plugins] legacy migrate failed:', e);
        }
      } finally {
        if (!cancelled) setMigrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migrate once per farm open
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
      setError(e instanceof Error ? e.message : 'Plugin action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-2">
        <h2 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2">
          <Plug className="w-5 h-5 text-emerald-700" />
          Plugins
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
          Install optional tools for this farm — crop packs (for example walnut blight today; apple
          and other packs later) and network plugins such as Freenet. Grouped by category so an
          orchardist only opens what they need. Fine-grained nav toggles stay under{' '}
          <Link to="/farm-management" className="text-emerald-700 font-semibold hover:underline">
            Farm management → Modules
          </Link>
          .
        </p>
        {!isAdmin && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Only farm admins can install or remove crop packs. Everyone can see what is installed.
          </p>
        )}
      </div>

      {migrating && (
        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5 px-1">
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

      {groups.map((group) => (
        <section key={group.category} className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {group.label}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{group.blurb}</p>
          </div>
          <div className="space-y-2">
            {group.entries.map((entry) => (
              <div key={entry.id}>
                {isCropPackPlugin(entry) ? (
                  <CropPackPluginRow
                    entry={entry}
                    disk={diskById.get(entry.id)}
                    ctx={ctx}
                    isAdmin={isAdmin}
                    farmCropPacks={farmCropPacks}
                    farmEnabledModules={farmEnabledModules}
                    busy={busyId === entry.id}
                    onRun={run}
                  />
                ) : (
                  <FreenetPluginRow entry={entry} onOpenSync={onOpenSync} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            On disk (`plugins/`)
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Dropped zips unpacked into the local <span className="font-mono">plugins/</span> folder
            that are not already wired in this build. Walnut blight ships in{' '}
            <span className="font-mono">plugins/walnut_blight/</span> and appears under Crop above.
          </p>
        </div>
        {diskError && (
          <p className="text-[11px] text-slate-500">
            Local package list unavailable ({diskError}). Use{' '}
            <span className="font-mono">npm run plugins:list</span> on this machine.
          </p>
        )}
        {!diskError && extraDiskPackages.length === 0 && (
          <p className="text-[11px] text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
            No extra unpacked packages. First-party walnut blight is listed under Crop. Place another{' '}
            <span className="font-mono">&#123;id&#125;.zip</span> in{' '}
            <span className="font-mono">plugins/</span>, then{' '}
            <span className="font-mono">npm run plugins:unpack -- plugins/&#123;id&#125;.zip</span>.
          </p>
        )}
        <div className="space-y-2">
          {extraDiskPackages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-1 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {pkg.label}{' '}
                    <span className="text-[10px] font-mono font-medium text-slate-400">
                      {pkg.id}@{pkg.version}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{pkg.blurb}</p>
                </div>
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {pkg.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CropPackPluginRow({
  entry,
  disk,
  ctx,
  isAdmin,
  farmCropPacks,
  farmEnabledModules,
  busy,
  onRun,
}: {
  entry: Extract<PluginCatalogEntry, { kind: 'crop_pack' }>;
  disk?: PluginPackageManifestV1;
  ctx: CropPackLifecycleCtx | null;
  isAdmin: boolean;
  farmCropPacks: ReturnType<typeof useAuth>['farmCropPacks'];
  farmEnabledModules: string[];
  busy: boolean;
  onRun: (packId: CropPackId, action: () => Promise<unknown>, okText: string) => Promise<void>;
}) {
  const installed = isPackInstalled(farmCropPacks, entry.id);
  const active = isPackActive(farmCropPacks, entry.id);
  const check = ctx ? entry.canInstall?.(ctx) : undefined;
  const statusLabel = !installed ? 'Not installed' : active ? 'Active' : 'Inactive';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <Package className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {entry.label}
              {disk ? (
                <span className="text-[10px] font-mono font-medium text-slate-400">
                  {' '}
                  {disk.id}@{disk.version}
                </span>
              ) : null}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{entry.blurb}</p>
          </div>
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

      {installed &&
        active &&
        entry.primaryPath &&
        entry.modules.some((m) => farmEnabledModules.includes(m)) && (
        <p className="text-[10px] text-slate-500">
          Open{' '}
          <Link
            to={entry.primaryPath}
            className="text-emerald-700 underline-offset-2 hover:underline"
          >
            {entry.label}
          </Link>{' '}
          for orchard inoculum and engine settings.
        </p>
      )}

      {isAdmin && ctx && (
        <div className="flex flex-wrap gap-2">
          {!installed && (
            <button
              type="button"
              disabled={busy || Boolean(check?.hard && !check.ok)}
              onClick={() =>
                void onRun(
                  entry.id,
                  () => installCropPack(ctx, entry.id),
                  `${entry.label} installed and active.`
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
                void onRun(
                  entry.id,
                  () => activateCropPack(ctx, entry.id),
                  `${entry.label} activated.`
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
                void onRun(
                  entry.id,
                  () => deactivateCropPack(ctx, entry.id),
                  `${entry.label} deactivated — settings kept.`
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
                    `Delete ${entry.label} from this farm?\n\nRemoves pack settings for this farm. Diary and map data are not deleted. This cannot be undone.`
                  )
                ) {
                  return;
                }
                void onRun(
                  entry.id,
                  () => deleteCropPack(ctx, entry.id),
                  `${entry.label} deleted from this farm.`
                );
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FreenetPluginRow({
  entry,
  onOpenSync,
}: {
  entry: Extract<PluginCatalogEntry, { kind: 'system' }>;
  onOpenSync?: () => void;
}) {
  const status = freenetStatusLabel();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{entry.blurb}</p>
        </div>
        <span
          className={clsx(
            'shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
            status.tone === 'active' && 'bg-emerald-100 text-emerald-800',
            status.tone === 'hub' && 'bg-sky-100 text-sky-900',
            status.tone === 'available' && 'bg-slate-100 text-slate-600'
          )}
        >
          {status.label}
        </span>
      </div>
      <p className="text-[10px] text-slate-500">
        Freenet is selected when the farm is created (mist / offline storage). It is not installed
        like a crop pack.
      </p>
      <div className="flex flex-wrap gap-2">
        {onOpenSync ? (
          <button
            type="button"
            onClick={onOpenSync}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-[11px] font-semibold"
          >
            Open Sync
          </button>
        ) : (
          <Link
            to="/settings?tab=sync"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-[11px] font-semibold"
          >
            Open Sync
          </Link>
        )}
      </div>
    </div>
  );
}
