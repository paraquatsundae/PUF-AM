import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Save, Map, Thermometer, CheckCircle2, Droplets } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { useFarmDiary, IrrigationSystemType } from '../lib/farmDiary';
import { FarmDryer, getFarmAssets, saveFarmAssets } from '../lib/farmAssets';
import { cn } from '../lib/utils';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

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
  }, [settings.irrigationSystemType, settings.waterAllocationMl]);

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

      {/* Blocks from map */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Map className="w-3.5 h-3.5 text-slate-600" />
              Blocks
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              From the Orchard Map — folders for harvest, diary, water, and drying.
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
                  {b.cultivar ? ` · ${b.cultivar}` : ''}
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
