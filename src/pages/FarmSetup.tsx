import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Save, Map, Thermometer, CheckCircle2, Droplets, Trees } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { useFarmDiary, IrrigationSystemType, resolveFarmProfile } from '../lib/farmDiary';
import { FarmDryer, getFarmAssets, saveFarmAssets } from '../lib/farmAssets';
import { cn } from '../lib/utils';
import {
  FARM_ENTERPRISES,
  TREE_SPECIES,
  type FarmEnterpriseId,
  type FarmProfile,
  type TreeSpeciesId,
} from '../../shared/farm/farmTypes';

const IRRIGATION_OPTIONS: { value: IrrigationSystemType; label: string }[] = [
  { value: 'micro', label: 'Micro-sprinkler' },
  { value: 'surface_drip', label: 'Surface drip' },
  { value: 'sub_surface', label: 'Subsurface drip (SDI)' },
  { value: 'flood', label: 'Flood / furrow' },
];

export function FarmSetup() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { blocks, loadData, isLoaded, totalAreaHa } = useMapStore();
  const { settings, updateSettings, canEdit } = useFarmDiary();

  const [dryers, setDryers] = useState<FarmDryer[]>([]);
  const [waterAllocationMl, setWaterAllocationMl] = useState<number>(500);
  const [irrigationSystemType, setIrrigationSystemType] = useState<IrrigationSystemType>('micro');
  const [farmProfile, setFarmProfile] = useState<FarmProfile>(() => resolveFarmProfile(undefined));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const orchardLike = useMemo(
    () =>
      farmProfile.enterprises.some((id) =>
        ['orchard_tree', 'fruit', 'vineyard'].includes(id)
      ),
    [farmProfile.enterprises]
  );

  useEffect(() => {
    if (farmId && !isLoaded) void loadData(farmId);
  }, [farmId, isLoaded, loadData]);

  useEffect(() => {
    if (!farmId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const assets = await getFarmAssets(farmId);
      if (!cancelled) {
        setDryers(assets.dryers);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  useEffect(() => {
    setIrrigationSystemType(settings.irrigationSystemType || 'micro');
    if (typeof settings.waterAllocationMl === 'number') {
      setWaterAllocationMl(settings.waterAllocationMl);
    }
    setFarmProfile(resolveFarmProfile(settings.farmProfile));
  }, [settings.irrigationSystemType, settings.waterAllocationMl, settings.farmProfile]);

  const toggleEnterprise = (id: FarmEnterpriseId) => {
    setFarmProfile((prev) => {
      const has = prev.enterprises.includes(id);
      let enterprises = has
        ? prev.enterprises.filter((e) => e !== id)
        : [...prev.enterprises, id];
      if (enterprises.length === 0) enterprises = ['orchard_tree'];
      // Newly added type becomes primary so paddock naming / map labels follow the change.
      const primaryEnterpriseId = has
        ? prev.primaryEnterpriseId && enterprises.includes(prev.primaryEnterpriseId)
          ? prev.primaryEnterpriseId
          : enterprises[0]
        : id;
      return resolveFarmProfile({
        ...prev,
        enterprises,
        primaryEnterpriseId,
        livestockEnabled: prev.livestockEnabled,
      });
    });
  };

  const setPrimary = (id: FarmEnterpriseId) => {
    setFarmProfile((prev) => {
      if (!prev.enterprises.includes(id)) return prev;
      return resolveFarmProfile({ ...prev, primaryEnterpriseId: id });
    });
  };

  const fieldClass =
    'bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400 w-full';

  const addDryer = () => {
    setDryers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: `Dryer ${prev.length + 1}`, capacityKg: undefined, notes: '' },
    ]);
  };

  const updateDryer = (id: string, patch: Partial<FarmDryer>) => {
    setDryers((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDryer = (id: string) => {
    setDryers((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSave = async () => {
    if (!farmId || !canEdit) return;
    const cleaned = dryers
      .map((d) => ({
        id: d.id,
        name: d.name.trim(),
        ...(d.capacityKg != null && !Number.isNaN(d.capacityKg) ? { capacityKg: d.capacityKg } : {}),
        ...(d.notes?.trim() ? { notes: d.notes.trim() } : {}),
      }))
      .filter((d) => d.name.length > 0);

    setSaving(true);
    try {
      await saveFarmAssets(farmId, { dryers: cleaned });
      setDryers(cleaned);
      updateSettings({
        irrigationSystemType,
        waterAllocationMl: Number(waterAllocationMl) || 0,
        farmProfile: resolveFarmProfile(farmProfile),
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      console.error('Failed to save farm setup', err);
      alert('Could not save. Check connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 pb-24 lg:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Farm setup</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            One-time infrastructure — blocks, water, dryers. Speeds up paddock logging.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !farmId || !canEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save all'}
          </button>
          {savedFlash && (
            <span className="text-[11px] font-medium text-emerald-600 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Farm type / enterprises */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Trees className="w-3.5 h-3.5 text-emerald-700" />
            Farm type
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tick everything you run. Set one as <strong>Primary</strong> — that drives new-paddock defaults
            and whether the map says Orchard or Paddock. Mixed farms are normal.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FARM_ENTERPRISES.map((ent) => {
            const on = farmProfile.enterprises.includes(ent.id);
            const isPrimary = on && farmProfile.primaryEnterpriseId === ent.id;
            return (
              <div
                key={ent.id}
                className={cn(
                  'text-left rounded-xl border px-3 py-2.5 transition-colors',
                  on
                    ? isPrimary
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-emerald-500/60 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50/40'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleEnterprise(ent.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold shrink-0',
                        on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                      )}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="text-xs font-semibold text-slate-900">{ent.label}</span>
                    {isPrimary && (
                      <span className="ml-auto text-[9px] font-bold uppercase tracking-wide text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 pl-6 leading-snug">{ent.blurb}</p>
                </button>
                {on && !isPrimary && (
                  <button
                    type="button"
                    onClick={() => setPrimary(ent.id)}
                    className="mt-2 ml-6 text-[10px] font-semibold text-emerald-700 hover:underline"
                  >
                    Set as primary
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={farmProfile.livestockEnabled}
            onChange={(e) =>
              setFarmProfile((prev) =>
                resolveFarmProfile({ ...prev, livestockEnabled: e.target.checked })
              )
            }
          />
          <span>
            <span className="text-xs font-semibold text-slate-900 block">Livestock</span>
            <span className="text-[10px] text-slate-500 leading-snug">
              Graze pasture, stubble, or regrowth; move between paddocks. Own input/output tracking later —
              works across orchard, hort, vineyard, broadacre, etc.
            </span>
          </span>
        </label>

        {orchardLike && (
          <label className="flex flex-col gap-0.5 max-w-xs">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Default tree / vine species</span>
            <select
              className={fieldClass}
              value={farmProfile.defaultSpeciesId || 'walnut'}
              onChange={(e) =>
                setFarmProfile((prev) => ({
                  ...prev,
                  defaultSpeciesId: e.target.value as TreeSpeciesId,
                }))
              }
            >
              {TREE_SPECIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Blocks from map */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Map className="w-3.5 h-3.5 text-slate-600" />
              Blocks
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              From the map — folders for harvest, diary, water, and drying.
              {totalAreaHa > 0 ? ` · ${totalAreaHa.toFixed(1)} ha mapped` : ''}
            </p>
          </div>
          <Link
            to="/map"
            className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 px-2 py-1 rounded-lg border border-slate-200"
          >
            Edit on map
          </Link>
        </div>
        {blocks.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No blocks yet. Draw blocks on the map first.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {blocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
              >
                <span className="font-semibold text-slate-800 truncate">{b.name}</span>
                <span className="text-slate-400 shrink-0">
                  {b.areaHa ? `${b.areaHa.toFixed(1)} ha` : '—'}
                  {b.species ? ` · ${b.species}` : ''}
                  {b.cultivar ? ` · ${b.cultivar}` : ''}
                  {b.seasonLabel ? ` · ${b.seasonLabel}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Water */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-sky-600" />
            Water
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Used by Water budget tracking and blight/irrigation models.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Seasonal allocation</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step="0.1"
                className={fieldClass}
                value={waterAllocationMl}
                onChange={(e) => setWaterAllocationMl(Number(e.target.value))}
              />
              <span className="text-[10px] text-slate-400 shrink-0">ML</span>
            </div>
            {totalAreaHa > 0 && waterAllocationMl > 0 && (
              <span className="text-[10px] text-slate-400">
                ≈ {(waterAllocationMl / totalAreaHa).toFixed(2)} ML/ha over mapped area
              </span>
            )}
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Irrigation method</span>
            <select
              className={fieldClass}
              value={irrigationSystemType}
              onChange={(e) => setIrrigationSystemType(e.target.value as IrrigationSystemType)}
            >
              {IRRIGATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Dryers */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-amber-600" />
              Dryers
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Set up once — Harvest → Drying picks from this list.
            </p>
          </div>
          <button
            type="button"
            onClick={addDryer}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Add dryer
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400 py-4 text-center">Loading…</p>
        ) : dryers.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No dryers yet. Add the bins/dryers you run on this farm.</p>
        ) : (
          <div className="space-y-2">
            {dryers.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_100px_1fr_auto] gap-2 items-end p-2 rounded-lg border border-slate-100 bg-slate-50/50"
              >
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Name</span>
                  <input
                    className={fieldClass}
                    value={d.name}
                    onChange={(e) => updateDryer(d.id, { name: e.target.value })}
                    placeholder="e.g. Dryer 1 / Bin A"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Capacity kg</span>
                  <input
                    type="number"
                    min={0}
                    className={fieldClass}
                    value={d.capacityKg ?? ''}
                    onChange={(e) =>
                      updateDryer(d.id, {
                        capacityKg: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="—"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Notes</span>
                  <input
                    className={fieldClass}
                    value={d.notes ?? ''}
                    onChange={(e) => updateDryer(d.id, { notes: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeDryer(d.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
