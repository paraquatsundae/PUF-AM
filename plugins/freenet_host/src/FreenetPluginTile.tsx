/**
 * Settings → Plugins → Network & storage → Freenet.
 *
 * The network pack's `pluginTile` surface (Plans/NETWORK_PACK_PLUGIN.md
 * § "Not available on this device"). Three honest states:
 *  - no host capability → *Not available on this device* and one line why;
 *  - Freenet-native farm on a capable shell → per-farm enable toggle;
 *  - cloud farm on a capable shell → no toggle; a Freenet mirror for cloud
 *    farms arrives with hybrid (Plans/FREENET_NETWORK_PACK.md §3, slice C).
 * Day-to-day node controls stay under Sync.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

import type { SystemPluginDef } from '../../../shared/farm/pluginsCatalog';
import { useAuth } from '../../../src/contexts/AuthContext';
import { isFreenetFarm } from '../../../src/lib/farmPipes';
import { getFreenetHostCapability } from '../../../src/lib/freenetHostCapability.ts';
import { isPackagedNativeAndroid } from '../../../src/lib/apiBase.ts';
import {
  hasFreenetHostChoice,
  isFreenetHostEnabled,
  setFreenetHostEnabled,
  subscribeFreenetHostEnabled,
} from './freenetHostEnable.ts';

type Props = { entry: SystemPluginDef; onOpenSync?: () => void };

function unavailableReason(): string {
  if (isPackagedNativeAndroid()) {
    return 'This tablet reads a Freenet farm through a paired laptop hub; a node of its own comes with the Android host (Phase 3).';
  }
  return 'The web app has no Freenet node. Open this farm in the desktop app to enable Freenet.';
}

export default function FreenetPluginTile({ entry, onOpenSync }: Props) {
  const { userData, isAdmin } = useAuth();
  const farmId = userData?.farmId ?? null;
  const capability = getFreenetHostCapability();
  const nativeFarm = isFreenetFarm();
  const [, setTick] = useState(0);
  useEffect(() => subscribeFreenetHostEnabled(() => setTick((n) => n + 1)), []);

  const enabled = nativeFarm && Boolean(farmId) && isFreenetHostEnabled(farmId);
  const chosen = farmId ? hasFreenetHostChoice(farmId) : false;

  const badge = !capability
    ? { label: 'Not available on this device', tone: 'muted' as const }
    : !nativeFarm
      ? { label: 'Coming with hybrid', tone: 'muted' as const }
      : enabled
        ? { label: 'Enabled on this farm', tone: 'active' as const }
        : { label: 'Off for this farm', tone: 'warn' as const };

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
            badge.tone === 'active' && 'bg-emerald-100 text-emerald-800',
            badge.tone === 'warn' && 'bg-amber-100 text-amber-900',
            badge.tone === 'muted' && 'bg-slate-100 text-slate-600'
          )}
        >
          {badge.label}
        </span>
      </div>

      {!capability && <p className="text-[10px] text-slate-500">{unavailableReason()}</p>}

      {capability && !nativeFarm && (
        <p className="text-[10px] text-slate-500">
          This farm lives in the cloud. A Freenet mirror for cloud farms arrives with hybrid
          storage; until then Freenet is enabled only on farms created with it.
        </p>
      )}

      {capability && nativeFarm && farmId && (
        <label className="flex items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 accent-emerald-700"
            checked={enabled}
            disabled={!isAdmin}
            onChange={(e) => setFreenetHostEnabled(farmId, e.target.checked)}
          />
          <span>
            Run this device’s Freenet node while this farm is open.{' '}
            {!chosen && <span className="text-slate-500">On by default — the farm was created on Freenet.</span>}
            {!isAdmin && <span className="text-slate-500"> Only farm admins can change this.</span>}
          </span>
        </label>
      )}

      {capability && nativeFarm && (
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
      )}
    </div>
  );
}
