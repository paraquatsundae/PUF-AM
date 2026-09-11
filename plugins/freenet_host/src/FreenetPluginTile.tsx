/**
 * Settings → Plugins → Network & storage → Freenet.
 *
 * The network pack's `pluginTile` surface (Plans/NETWORK_PACK_PLUGIN.md
 * § "Not available on this device"). Honest states:
 *  - no host capability → *Not available on this device* and one line why;
 *  - Freenet-native farm on a capable shell → per-farm enable toggle;
 *  - cloud farm on a capable shell → the hybrid enable flow
 *    (`FreenetHybridEnable`, Plans/FREENET_NETWORK_PACK.md §3): mint a FarmCode,
 *    seal it here, flip the farm doc; members enter the code to take part;
 *  - a mirror device (joined a cloud farm over Freenet) → read-only note.
 * Day-to-day node controls stay under Sync.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

import type { SystemPluginDef } from '../../../shared/farm/pluginsCatalog';
import { isFarmFreenetHostEnabled } from '../../../shared/farm/networkPacks';
import { useAuth } from '../../../src/contexts/AuthContext';
import { activeFarmPipes, mirroredCloudFarmId } from '../../../src/lib/farmPipes';
import { getFreenetHostCapability } from '../../../src/lib/freenetHostCapability.ts';
import { isPackagedNativeAndroid } from '../../../src/lib/apiBase.ts';
import {
  hasFreenetHostChoice,
  isFreenetHostEnabled,
  setFreenetHostEnabled,
  subscribeFreenetHostEnabled,
} from './freenetHostEnable.ts';
import { subscribeFreenetHybridDevice } from './freenetHostCloud.ts';
import { FreenetHybridEnable } from './FreenetHybridEnable.tsx';

type Props = { entry: SystemPluginDef; onOpenSync?: () => void };

function unavailableReason(): string {
  if (isPackagedNativeAndroid()) {
    return 'This tablet reads a Freenet farm through a paired laptop hub; a node of its own comes with the Android host (Phase 3).';
  }
  return 'The web app has no Freenet node. Open this farm in the desktop app to enable Freenet.';
}

export default function FreenetPluginTile({ entry, onOpenSync }: Props) {
  const { userData, isAdmin, farmNetworkPacks } = useAuth();
  const farmId = userData?.farmId ?? null;
  const capability = getFreenetHostCapability();
  const [, setTick] = useState(0);
  useEffect(() => subscribeFreenetHostEnabled(() => setTick((n) => n + 1)), []);
  useEffect(() => subscribeFreenetHybridDevice(() => setTick((n) => n + 1)), []);

  const pipes = activeFarmPipes(farmId);
  // A device's *own* farm on Freenet: a native farm, or a mirror it joined.
  const nativeFarm = pipes.freenet && !pipes.cloud;
  const cloudFarm = pipes.cloud;
  const mirror = pipes.cloudMirror;

  const localEnabled = nativeFarm && Boolean(farmId) && isFreenetHostEnabled(farmId);
  const docEnabled = cloudFarm && isFarmFreenetHostEnabled(farmNetworkPacks);
  const seedHere = cloudFarm && mirroredCloudFarmId() === farmId;
  const chosen = farmId ? hasFreenetHostChoice(farmId) : false;

  const badge = !capability
    ? { label: 'Not available on this device', tone: 'muted' as const }
    : mirror
      ? { label: 'Mirror of a cloud farm', tone: 'active' as const }
      : nativeFarm
        ? localEnabled
          ? { label: 'Enabled on this farm', tone: 'active' as const }
          : { label: 'Off for this farm', tone: 'warn' as const }
        : docEnabled
          ? seedHere
            ? { label: 'Mirror on — key on this device', tone: 'active' as const }
            : { label: 'Mirror on — enter FarmCode', tone: 'warn' as const }
          : { label: 'Off for this farm', tone: 'muted' as const };

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

      {capability && mirror && (
        <p className="text-[10px] text-slate-500">
          This device holds a read-only mirror of a cloud farm. The node below keeps it
          refreshable; to edit the farm, join it with an invite PIN.
        </p>
      )}

      {capability && cloudFarm && farmId && (
        <FreenetHybridEnable farmId={farmId} onOpenSync={onOpenSync} />
      )}

      {capability && nativeFarm && farmId && (
        <label className="flex items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 accent-emerald-700"
            checked={localEnabled}
            disabled={!isAdmin && !mirror}
            onChange={(e) => setFreenetHostEnabled(farmId, e.target.checked)}
          />
          <span>
            Run this device’s Freenet node while this farm is open.{' '}
            {!chosen && (
              <span className="text-slate-500">
                On by default — {mirror ? 'the mirror came over Freenet.' : 'the farm was created on Freenet.'}
              </span>
            )}
            {!isAdmin && !mirror && <span className="text-slate-500"> Only farm admins can change this.</span>}
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
