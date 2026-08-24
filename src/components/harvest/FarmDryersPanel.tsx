import React, { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Save, Thermometer, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFarmDiary } from '../../lib/farmDiary';
import { FarmDryer, getFarmAssets, saveFarmAssets } from '../../lib/farmAssets';

const fieldClass =
  'bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 w-full';

/** Dryer list — was Farm setup; now the harvest pack surface. */
export function FarmDryersPanel({ onSaved }: { onSaved?: () => void }) {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { canEdit } = useFarmDiary();
  const [dryers, setDryers] = useState<FarmDryer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

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
      onSaved?.();
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      console.error('Failed to save dryers', err);
      alert('Could not save dryers. Check connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5 text-amber-600" />
            Dryers
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Set up once — drying sessions pick from this list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="text-[11px] font-medium text-emerald-600 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={addDryer}
            disabled={!canEdit}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Add dryer
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !farmId || !canEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[11px] font-semibold disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                  onChange={(e) => updateDryer(d.id, { notes: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <button
                type="button"
                onClick={() => removeDryer(d.id)}
                disabled={!canEdit}
                className="p-2 text-slate-400 hover:text-rose-600 rounded-lg disabled:opacity-40"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
