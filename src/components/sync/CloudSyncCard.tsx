/**
 * Settings → Sync → **Cloud sync**, on farms that have a cloud.
 *
 * The counters are the cloud outbox and nothing else: diary and issues, map
 * edits, and photos written on this device while it had no internet. A Freenet
 * farm never flushes to Firebase, so this card is not rendered there at all
 * rather than sitting at zero forever.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §1
 */

import React from 'react';
import { Cloud, Loader2, RefreshCw } from 'lucide-react';

import { byoProjectId, isByoFirebase } from '../../lib/byoFirebaseConfig';
import { SyncNote } from './SyncNote';
import type { FarmSync } from './useFarmSync';

export function CloudSyncCard({ sync }: { sync: FarmSync }) {
  const { busy, pending } = sync;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-sky-50 rounded-xl">
          <Cloud className="w-5 h-5 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Cloud sync</h2>
          <p className="text-sm text-slate-500">
            Work saved with no internet waits here until this device is back online.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.total}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Waiting</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.outbox}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Diary / issues</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.geometry}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Map edits</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-3">
          <p className="text-xl font-bold text-slate-900">{pending.photos}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Photos</p>
        </div>
      </div>

      <SyncNote sync={sync} zone="cloud" />

      <button
        type="button"
        disabled={!!busy || !sync.online}
        title={sync.online ? undefined : 'This device is offline'}
        onClick={() => sync.flushToCloud()}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-700 text-white text-sm font-medium disabled:opacity-50"
      >
        {busy === 'flush' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        Send waiting work to the cloud
      </button>
      <p className="text-[11px] text-slate-500">
        This happens by itself when the app is online. The button is for when you want to watch it
        happen before driving out of range.
      </p>
      {isByoFirebase() ? (
        <p className="text-[11px] text-slate-500">
          This farm is on your Firebase project{' '}
          <span className="font-mono text-slate-800">{byoProjectId()}</span>. Google bills that
          project — PUFworks does not.
        </p>
      ) : null}
    </div>
  );
}
