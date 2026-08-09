/**
 * Settings → Sync → **Wi‑Fi (LAN)**.
 *
 * The pipe every farm has, whichever backend it was created against: find the
 * hub on this network, pair with it once if it asks, then push and pull the
 * farm across the shed. Nothing here touches the cloud or Freenet.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §2
 */

import React, { useState } from 'react';
import { CloudUpload, Copy, HardDriveDownload, KeyRound, Loader2, Radar, Wifi } from 'lucide-react';
import { clsx } from 'clsx';

import { nsdBrowseAvailable } from '../../lib/nsdPeers';
import { SyncNote } from './SyncNote';
import type { FarmSync } from './useFarmSync';

export function LanSyncCard({ sync }: { sync: FarmSync }) {
  const [manualHub, setManualHub] = useState('');
  const [pairingCode, setPairingCode] = useState('');

  const { busy, hubInfo, hubLabel, hubMissing, lanMeta, needsHub, needsPairing, selectedPeer } =
    sync;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-50 rounded-xl">
          <Wifi className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Wi‑Fi (LAN)</h2>
          <p className="text-sm text-slate-500">
            Move the farm between devices on this network — the tablet in the ute and the laptop in
            the shed. Works with no internet.
          </p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${
            sync.online
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          }`}
        >
          {sync.online ? 'Online' : 'Offline'}
        </span>
      </div>

      <SyncNote sync={sync} zone="lan" />

      <p className="text-xs text-slate-500">
        A hub is either the installed PUF-AM app on a laptop with{' '}
        <span className="font-medium">Tablet hub</span> switched on, or a workshop{' '}
        <code className="text-[11px]">npm run dev</code>. Both advertise as{' '}
        <code className="text-[11px]">_pufom-sync._tcp</code>, so Scan finds them over native NSD
        with no address typed. The installed app asks for a pairing code once; the workshop one does
        not.
      </p>

      {needsHub && (
        <div
          className={clsx(
            'rounded-xl border px-3 py-3 space-y-2',
            hubMissing ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50/60'
          )}
        >
          <p className={clsx('text-xs font-semibold', hubMissing ? 'text-amber-900' : 'text-emerald-900')}>
            {hubMissing
              ? 'No hub yet — this tablet cannot sync until it can see the laptop'
              : `Hub: ${selectedPeer}`}
          </p>
          <p className="text-[11px] text-slate-600">
            PUF-AM on this tablet keeps the farm locally, but push, pull and join all run through a
            laptop on the same Wi‑Fi. On that laptop, open PUF-AM and switch on{' '}
            <span className="font-medium">Settings → Tablet hub</span>. Scan should then find it;
            otherwise type the address it shows.
          </p>
          <div className="flex gap-2">
            <input
              value={manualHub}
              onChange={(e) => setManualHub(e.target.value)}
              placeholder="192.168.1.20:3000"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm"
            />
            <button
              type="button"
              disabled={!!busy || !manualHub.trim()}
              onClick={() => {
                sync.setManualHubAddress(manualHub);
                setManualHub('');
              }}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy === 'hub' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Use
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            The laptop prints this address when it starts. On the laptop it also appears in Settings
            → Tablet hub, under “give them this address”.
          </p>
        </div>
      )}

      {/*
        A packaged PUF-AM desktop hub asks for a pairing code once. Shown only
        when the hub actually said so, so a workshop `npm run dev` hub — which
        needs nothing — is unchanged.
      */}
      {needsHub && needsPairing && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
            <KeyRound className="w-4 h-4" />
            Pair with {hubInfo?.name || selectedPeer}
          </div>
          <p className="text-[11px] text-slate-600">
            That laptop runs the packaged PUF-AM app, which only serves tablets it has been
            introduced to. On the laptop open{' '}
            <span className="font-medium">Settings → Tablet hub</span> and read out the pairing
            code. You only do this once per tablet.
          </p>
          <div className="flex gap-2">
            <input
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              placeholder="K7M2-9Q4X"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 font-mono text-base tracking-widest uppercase"
            />
            <button
              type="button"
              disabled={!!busy || !pairingCode.trim()}
              onClick={() => {
                sync.pair(pairingCode);
                setPairingCode('');
              }}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy === 'pair' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Pair
            </button>
          </div>
        </div>
      )}

      {needsHub && hubInfo?.pairingRequired && !needsPairing && (
        <p className="text-[11px] text-emerald-800">
          Paired with {hubInfo.name}
          {hubInfo.freenet ? ' · its Freenet node is reachable' : ' · Freenet not running there'}.
        </p>
      )}
      {sync.scanSource && <p className="text-[11px] text-slate-400">Last scan: {sync.scanSource}</p>}
      {hubLabel && (
        <div className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-xs text-slate-600 min-w-0 break-all">This hub: {hubLabel}</p>
          <button
            type="button"
            title="Copy hub URL"
            onClick={() => {
              const url = hubLabel.split(' · ').pop();
              if (url) void navigator.clipboard.writeText(url);
            }}
            className="shrink-0 p-1 text-slate-400 hover:text-slate-700"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => sync.scanForHubs()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'scan' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Radar className="w-4 h-4" />
          )}
          {nsdBrowseAvailable() ? 'Scan for hubs' : 'Scan mDNS peers'}
        </button>
        {selectedPeer && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => sync.selectPeer('', true)}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >
            Clear peer selection
          </button>
        )}
      </div>

      {sync.peers.length > 0 && (
        <ul className="space-y-2">
          {sync.peers.map((peer) => {
            const active = selectedPeer === peer.baseUrl || (!selectedPeer && peer.self);
            return (
              <li key={peer.id}>
                <button
                  type="button"
                  onClick={() => sync.selectPeer(peer.baseUrl, true)}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 rounded-xl border transition-colors',
                    active ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {peer.name}
                    {peer.self ? (
                      <span className="ml-2 text-[10px] font-bold uppercase text-emerald-700">
                        this hub
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {peer.baseUrl}
                    {peer.host ? ` · ${peer.host}` : ''}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedPeer && (
        <p className="text-xs text-emerald-800">
          Push/pull target: <span className="font-mono">{selectedPeer}</span>
        </p>
      )}

      {lanMeta && (
        <p className="text-xs text-slate-500">
          Shelf: {Math.round(lanMeta.bytes / 1024)} KB · updated{' '}
          {new Date(lanMeta.updatedAt).toLocaleString()}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy || !sync.online}
          onClick={() => sync.pushToLan()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {busy === 'push' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CloudUpload className="w-4 h-4" />
          )}
          Push to Wi‑Fi
        </button>
        <button
          type="button"
          disabled={!!busy || !sync.online}
          onClick={() => sync.pullFromLan()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 text-emerald-900 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50"
        >
          {busy === 'pull' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <HardDriveDownload className="w-4 h-4" />
          )}
          Pull from Wi‑Fi
        </button>
      </div>
    </div>
  );
}
