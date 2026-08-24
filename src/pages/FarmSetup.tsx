import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Map, CheckCircle2, Trees, Highlighter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMapStore } from '../lib/mapStore';
import { useFarmDiary, resolveFarmProfile } from '../lib/farmDiary';
import { FarmPeopleCard } from '../components/FarmPeopleCard';
import { FreenetSendNudge } from '../components/FreenetSendNudge';
import { CropPacksCard } from '../components/CropPacksCard';
import { cn } from '../lib/utils';
import {
  HIGHLIGHT_DEFAULT_SECONDS,
  HIGHLIGHT_DURATION_PRESETS_SEC,
} from '../lib/mapHighlights';
import {
  FARM_ENTERPRISES,
  TREE_SPECIES,
  type FarmEnterpriseId,
  type FarmProfile,
  type TreeSpeciesId,
} from '../../shared/farm/farmTypes';

const EMPTY_PROFILE: FarmProfile = {
  enterprises: [],
  livestockEnabled: false,
  defaultSpeciesId: '',
};

export function FarmSetup() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const { blocks, loadData, isLoaded, totalAreaHa } = useMapStore();
  const { settings, updateSettings, canEdit } = useFarmDiary();

  const [highlightDefaultSeconds, setHighlightDefaultSeconds] = useState(HIGHLIGHT_DEFAULT_SECONDS);
  const [farmProfile, setFarmProfile] = useState<FarmProfile>(EMPTY_PROFILE);
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
    if (
      typeof settings.highlightDefaultSeconds === 'number' &&
      settings.highlightDefaultSeconds > 0
    ) {
      setHighlightDefaultSeconds(Math.round(settings.highlightDefaultSeconds));
    } else {
      setHighlightDefaultSeconds(HIGHLIGHT_DEFAULT_SECONDS);
    }
    if (
      settings.farmProfile &&
      typeof settings.farmProfile === 'object' &&
      Array.isArray(settings.farmProfile.enterprises)
    ) {
      setFarmProfile(resolveFarmProfile(settings.farmProfile));
    } else {
      setFarmProfile(EMPTY_PROFILE);
    }
  }, [settings.highlightDefaultSeconds, settings.farmProfile]);

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

  const handleSave = async () => {
    if (!farmId || !canEdit) return;

    setSaving(true);
    try {
      const profile = resolveFarmProfile(farmProfile);
      updateSettings({
        irrigationSystemType: settings.irrigationSystemType || 'micro',
        waterAllocationMl:
          typeof settings.waterAllocationMl === 'number' ? settings.waterAllocationMl : 0,
        farmProfile: profile,
        highlightDefaultSeconds: Math.min(
          600,
          Math.max(5, Math.round(Number(highlightDefaultSeconds) || HIGHLIGHT_DEFAULT_SECONDS))
        ),
      });

      // Crop packs (blight, …) are Install / Activate / Deactivate / Delete
      // via CropPacksCard — Farm type save no longer auto-toggles modules.

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
            Farm type, people, and mapped blocks. Water and dryers live on their packs.
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

      <FreenetSendNudge />

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

      {/*
        People sits with the rest of the farm's one-time setup rather than in
        Settings: "who is on this farm" is the same kind of fact as which blocks
        it has, and on a Freenet farm there was previously nowhere at
        all to see it — see Plans/SETTINGS_SYNC_AND_CREW.md §4a.
      */}
      <CropPacksCard />

      <FarmPeopleCard />

      {/* Blocks from map */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Map className="w-3.5 h-3.5 text-slate-600" />
              Blocks
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              From the map — folders for diary, harvest, and water when those packs are on.
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

      {/* Map overlays */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Highlighter className="w-3.5 h-3.5 text-teal-700" />
            Map highlights
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Default duration for viewer/worker “check this” highlights. Admin and farmer can pick a
            longer time when sending.
          </p>
        </div>
        <label className="flex flex-col gap-0.5 max-w-xs">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Default duration</span>
          <select
            className={fieldClass}
            value={highlightDefaultSeconds}
            onChange={(e) => setHighlightDefaultSeconds(Number(e.target.value))}
            disabled={!canEdit}
          >
            {[...new Set([HIGHLIGHT_DEFAULT_SECONDS, ...HIGHLIGHT_DURATION_PRESETS_SEC, highlightDefaultSeconds])]
              .sort((a, b) => a - b)
              .map((sec) => (
                <option key={sec} value={sec}>
                  {sec < 60 ? `${sec} seconds` : `${sec / 60} minute${sec === 60 ? '' : 's'}`}
                </option>
              ))}
          </select>
        </label>
      </div>
    </div>
  );
}
