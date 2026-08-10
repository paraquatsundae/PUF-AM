/**
 * Settings → **Sync**: Wi‑Fi, then this farm's one off-device pipe, then files.
 *
 * A farm is created against Cloud sync *or* the Offline Freenet network, never
 * both, so an operator gets exactly one of those two cards — see
 * [`farmPipes.ts`](../../lib/farmPipes.ts), which also holds the one exception
 * for bench sessions. Wi‑Fi and files apply either way.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §1–§2
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';

import { activeFarmPipes, showFreenetFarmTools } from '../../lib/farmPipes';
import { MistFarmSyncCard } from '../MistFarmSyncCard';
import { AutoSyncCard } from './AutoSyncCard';
import { CloudSyncCard } from './CloudSyncCard';
import { FarmGatewayCard } from './FarmGatewayCard';
import { FilesBackupCard } from './FilesBackupCard';
import { LanSyncCard } from './LanSyncCard';
import { useFarmSync } from './useFarmSync';

/**
 * Hiding invite PINs on a Freenet farm — they are a Firebase mechanism — leaves
 * "who else is on this farm" unanswered on the one surface that used to answer
 * it. The answer now has a page (Farm setup → People, plan §4a), so this note's
 * job is to point at it rather than to apologise for its absence.
 */
function FreenetCrewNote() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <Users className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
      <p className="text-xs text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-800">Who is on this farm.</span> Everyone you have
        read a join ticket out to, at the role that ticket granted. This farm has no cloud account
        list — the tickets you issue are the record, and{' '}
        <Link to="/farm-setup" className="font-semibold text-emerald-700 hover:underline">
          Farm setup → People
        </Link>{' '}
        shows them.
      </p>
    </div>
  );
}

export function FarmSyncCards() {
  const sync = useFarmSync();
  const pipes = activeFarmPipes();

  if (!sync.farmId) return null;

  return (
    <>
      {/*
        First, because it is the only card most operators need: it picks the
        best route available and says what happened. The per-pipe cards below
        stay as they were — this does not replace them, it answers ahead of them.
      */}
      <AutoSyncCard />
      <LanSyncCard sync={sync} />
      {/*
        Only on a device that is a *client* of a hub. A desktop is the hub — its
        remote reach is a VPN on that machine plus Settings → Tablet hub, not an
        address it would type about itself.
      */}
      {sync.needsHub && <FarmGatewayCard sync={sync} />}
      {pipes.cloud && <CloudSyncCard sync={sync} />}
      {showFreenetFarmTools() && <MistFarmSyncCard />}
      {pipes.freenet && <FreenetCrewNote />}
      <FilesBackupCard sync={sync} />
    </>
  );
}
