/**
 * Farm Setup teaser — full Install / Activate / Delete lives under
 * Settings → Plugins (Plans/CROP_PACK_PLUGIN.md).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import {
  isPackActive,
  isPackInstalled,
  listCropPacks,
} from '../../shared/farm/cropPacks';
import { useAuth } from '../contexts/AuthContext';

export function CropPacksCard() {
  const { isAdmin, farmCropPacks } = useAuth();
  const packs = listCropPacks();
  const installedCount = packs.filter((p) => isPackInstalled(farmCropPacks, p.id)).length;
  const activeCount = packs.filter((p) => isPackActive(farmCropPacks, p.id)).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5 text-emerald-700" />
        Plugins
      </h2>
      <p className="text-[11px] text-slate-500 leading-snug">
        Crop packs and Freenet are managed under Settings → Plugins (grouped by category).
        {installedCount > 0
          ? ` ${activeCount} active · ${installedCount} installed crop pack${installedCount === 1 ? '' : 's'} on this farm.`
          : ' No crop packs installed yet.'}
      </p>
      <Link
        to="/settings?tab=plugins"
        className="inline-flex text-[11px] font-semibold text-emerald-700 underline-offset-2 hover:underline"
      >
        {isAdmin ? 'Open Settings → Plugins' : 'View Settings → Plugins'}
      </Link>
    </div>
  );
}
