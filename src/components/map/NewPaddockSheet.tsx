/**
 * First-run sheet after closing a paddock polygon — name first, then
 * enterprise-aware second fields (species→cultivar, season crop, etc.).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { OrchardBlock } from '../../lib/mapStore';
import type { FarmProfile } from '../../lib/farmDiary';
import { resolveFarmProfile } from '../../lib/farmDiary';
import {
  cultivarsForSpecies,
  defaultGeometryKind,
  FARM_ENTERPRISES,
  getEnterprise,
  primaryEnterprise,
  speciesForEnterprise,
  type FarmEnterpriseId,
  type TreeSpeciesId,
} from '../../../shared/farm/farmTypes';

export type NewPaddockSave = {
  name: string;
  cultivar: string;
  /** Empty string clears a mistaken orchard default on non-tree paddocks. */
  species?: string;
  cropKind?: FarmEnterpriseId;
  geometryKind?: OrchardBlock['geometryKind'];
  seasonLabel?: string;
  density?: string;
};

type Props = {
  block: OrchardBlock;
  farmProfile?: FarmProfile | null;
  onSave: (updates: NewPaddockSave) => void;
  onDismiss: () => void;
};

export function NewPaddockSheet({ block, farmProfile, onSave, onDismiss }: Props) {
  const profile = useMemo(
    () => resolveFarmProfile(farmProfile ?? undefined),
    [farmProfile]
  );
  const enterpriseChoices = profile.enterprises.length
    ? FARM_ENTERPRISES.filter((e) => profile.enterprises.includes(e.id))
    : FARM_ENTERPRISES.filter((e) => e.id === 'orchard_tree');

  const initialKind =
    (block.cropKind && profile.enterprises.includes(block.cropKind)
      ? block.cropKind
      : primaryEnterprise(profile)) as FarmEnterpriseId;

  const [name, setName] = useState(block.name || '');
  const [cropKind, setCropKind] = useState<FarmEnterpriseId>(initialKind);
  const initialEnterprise = getEnterprise(initialKind);
  const [species, setSpecies] = useState(() => {
    if (initialEnterprise.paddockModel !== 'species_cultivar') return '';
    return block.species || profile.defaultSpeciesId || 'walnut';
  });
  const [cultivar, setCultivar] = useState(block.cultivar || '');
  const [seasonLabel, setSeasonLabel] = useState(block.seasonLabel || '');
  const inputRef = useRef<HTMLInputElement>(null);
  /** Ignore backdrop/close until the Finish tap that opened us has fully settled (Android WebView). */
  const [dismissArmed, setDismissArmed] = useState(false);

  const enterprise = getEnterprise(cropKind);
  const speciesOptions = speciesForEnterprise(cropKind);
  const cultivarOptions = cultivarsForSpecies(species);

  useEffect(() => {
    setName(block.name || '');
    setCropKind(initialKind);
    const ent = getEnterprise(initialKind);
    setSpecies(
      ent.paddockModel === 'species_cultivar'
        ? block.species || profile.defaultSpeciesId || 'walnut'
        : ''
    );
    setCultivar(block.cultivar || '');
    setSeasonLabel(block.seasonLabel || '');
    setDismissArmed(false);
    const arm = window.setTimeout(() => setDismissArmed(true), 500);
    const focus = window.setTimeout(() => inputRef.current?.focus(), 520);
    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(focus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on new block only
  }, [block.id]);

  useEffect(() => {
    if (enterprise.paddockModel !== 'species_cultivar') return;
    if (!speciesOptions.some((s) => s.id === species)) {
      const next = speciesOptions[0]?.id || profile.defaultSpeciesId || 'walnut';
      setSpecies(next);
    }
  }, [cropKind, enterprise.paddockModel, species, speciesOptions, profile.defaultSpeciesId]);

  useEffect(() => {
    if (enterprise.paddockModel !== 'species_cultivar') return;
    if (cultivar && !cultivarOptions.includes(cultivar) && cultivar !== 'Other') {
      setCultivar('');
    }
  }, [species, cultivar, cultivarOptions, enterprise.paddockModel]);

  const tryDismiss = () => {
    if (!dismissArmed) return;
    onDismiss();
  };

  const submit = () => {
    const trimmed = name.trim();
    const geom = defaultGeometryKind(cropKind);
    const base: NewPaddockSave = {
      name: trimmed || block.name || 'Paddock',
      cropKind,
      geometryKind: geom,
      cultivar: '',
    };

    if (enterprise.paddockModel === 'species_cultivar') {
      onSave({
        ...base,
        species,
        cultivar: cultivar.trim() || '',
        seasonLabel: '',
      });
      return;
    }

    // Non-tree: clear orchard fields so walnut / TRV / density never stick.
    const clearOrchard: NewPaddockSave = {
      ...base,
      species: '',
      density: '',
      seasonLabel: seasonLabel.trim(),
    };

    if (enterprise.paddockModel === 'seasonal_crop') {
      onSave({
        ...clearOrchard,
        cultivar: seasonLabel.trim(),
      });
      return;
    }

    // water_zone / dam
    onSave({
      ...clearOrchard,
      cultivar: cultivar.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[2500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className={`absolute inset-0 bg-slate-900/50 backdrop-blur-sm ${dismissArmed ? '' : 'pointer-events-none'}`}
        aria-label="Dismiss"
        onClick={tryDismiss}
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Name this paddock</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Boundary saved
              {block.areaHa != null ? ` · ${block.areaHa} ha` : ''}
              {profile.livestockEnabled ? ' · livestock on' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={tryDismiss}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/80"
            aria-label="Close"
            disabled={!dismissArmed}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {enterpriseChoices.length > 1 ? (
            <div className="space-y-1.5">
              <label htmlFor="paddock-kind" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Paddock type
              </label>
              <select
                id="paddock-kind"
                value={cropKind}
                onChange={(e) => setCropKind(e.target.value as FarmEnterpriseId)}
                className="w-full px-3 py-3 border border-emerald-300 rounded-xl text-base bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              >
                {enterpriseChoices.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Defaults to your farm primary ({getEnterprise(primaryEnterprise(profile)).shortLabel}). Change per paddock if mixed.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              {enterprise.label}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="paddock-name" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Paddock name
            </label>
            <input
              id="paddock-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              placeholder="e.g. North 12, Dam 3, Bore zone A"
              autoComplete="off"
              enterKeyHint="done"
            />
          </div>

          {enterprise.paddockModel === 'species_cultivar' && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="paddock-species" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Species
                </label>
                <select
                  id="paddock-species"
                  value={species}
                  onChange={(e) => setSpecies(e.target.value as TreeSpeciesId)}
                  className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                >
                  {speciesOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="paddock-cultivar" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  {enterprise.varietyLabel}{' '}
                  <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <select
                  id="paddock-cultivar"
                  value={cultivar}
                  onChange={(e) => setCultivar(e.target.value)}
                  className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                >
                  <option value="">Select later…</option>
                  {cultivarOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {enterprise.paddockModel === 'seasonal_crop' && (
            <div className="space-y-1.5">
              <label htmlFor="paddock-season" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                This season’s crop{' '}
                <span className="font-normal normal-case text-slate-400">(skeleton)</span>
              </label>
              <input
                id="paddock-season"
                type="text"
                value={seasonLabel}
                onChange={(e) => setSeasonLabel(e.target.value)}
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                placeholder="e.g. 2026 canola — full rotations later"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400">
                Season-by-season detail comes later. Name is enough for now.
              </p>
            </div>
          )}

          {enterprise.paddockModel === 'water_zone' && (
            <div className="space-y-1.5">
              <label htmlFor="paddock-pasture" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Pasture / use{' '}
                <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <input
                id="paddock-pasture"
                type="text"
                value={cultivar}
                onChange={(e) => setCultivar(e.target.value)}
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                placeholder="e.g. Bore 2 zone, holding paddock"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400">
                Station paddocks are often zones around water — water-point tools come later.
              </p>
            </div>
          )}

          {enterprise.paddockModel === 'dam' && (
            <div className="space-y-1.5">
              <label htmlFor="paddock-stock" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Stock / species{' '}
                <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <input
                id="paddock-stock"
                type="text"
                value={cultivar}
                onChange={(e) => setCultivar(e.target.value)}
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                placeholder="e.g. Marron"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400">Dam / aquaculture detail lands in a later phase.</p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={tryDismiss}
              disabled={!dismissArmed}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              Skip for now
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              Save name
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
