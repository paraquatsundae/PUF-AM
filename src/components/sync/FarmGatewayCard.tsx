/**
 * Settings → Sync → **Farm gateway**.
 *
 * One address, entered once, so this tablet reaches the farm from anywhere —
 * paddock, ute, home — with no Freenet node on it and no laptop on its Wi‑Fi.
 *
 * Deliberately its own card rather than a second field inside Wi‑Fi (LAN). The
 * two answer different questions: *which laptop is on this network* is a thing
 * that changes every time the tablet moves, and *where is the farm's hub* is a
 * thing an operator sets up once and never thinks about again. Putting the second
 * one inside the first made it look like another troubleshooting step.
 *
 * @see src/lib/farmGateway.ts — the address rules, including what is refused
 * @see Plans/APK_FREENET_PLUGIN.md §8d
 */

import React, { useState } from 'react';
import { Globe2, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

import { gatewayKindLabel, gatewayReachesAnywhere } from '../../lib/farmGateway';
import { SyncNote } from './SyncNote';
import type { FarmSync } from './useFarmSync';

export function FarmGatewayCard({ sync }: { sync: FarmSync }) {
  const [address, setAddress] = useState('');
  const [pairingCode, setPairingCode] = useState('');

  const { busy, gateway, gatewayInUse, gatewayNeedsPairing } = sync;
  const anywhere = gateway ? gatewayReachesAnywhere(gateway.kind) : false;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-sky-50 rounded-xl">
          <Globe2 className="w-5 h-5 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Farm gateway</h2>
          <p className="text-sm text-slate-500">
            The farm’s own machine, reachable from anywhere. Set the address once and this tablet
            syncs and joins off the shed Wi‑Fi as well as on it — nothing extra to install here.
          </p>
        </div>
        <span
          className={clsx(
            'shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
            !gateway
              ? 'bg-slate-50 text-slate-500 border-slate-200'
              : gatewayInUse
                ? 'bg-sky-50 text-sky-700 border-sky-100'
                : anywhere
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-100',
          )}
        >
          {!gateway
            ? 'Not set'
            : gatewayInUse
              ? 'In use now'
              : `Saved · ${gatewayKindLabel(gateway.kind)}`}
        </span>
      </div>

      <SyncNote sync={sync} zone="gateway" />

      {gateway ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
          <p className="text-xs text-slate-700 break-all">
            <span className="font-semibold">{gateway.hubName || 'Farm hub'}</span> ·{' '}
            <span className="font-mono">{gateway.base}</span>
          </p>
          <p className="text-[11px] text-slate-500">
            {gatewayInUse
              ? 'This tablet is using the gateway right now — there is no PUF-AM laptop on this Wi‑Fi.'
              : anywhere
                ? 'Held ready. Wi‑Fi is used whenever a laptop is on this network, because it is faster and free; the gateway takes over when none is.'
                : 'This is a Wi‑Fi address, so it only answers on that network. For “from anywhere”, use the laptop’s VPN address.'}
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => sync.forgetGateway()}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-red-700"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Forget this gateway
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700">
          {gateway ? 'Replace the gateway address' : 'Gateway address'}
        </label>
        <div className="flex gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="100.101.102.103:3000"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm"
          />
          <button
            type="button"
            disabled={!!busy || !address.trim()}
            onClick={() => {
              sync.setGatewayAddress(address);
              setAddress('');
            }}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy === 'gateway' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Read it off the farm laptop: <span className="font-medium">Settings → Tablet hub</span>
          shows the addresses it is serving on. Use its VPN address (Tailscale gives every machine
          one, like <span className="font-mono">100.101.102.103</span>) so it works away from the
          shed.
        </p>
      </div>

      {/*
        Not a warning that can be clicked past: an address that cannot carry the
        hub token safely is refused outright, and this is the operator's advance
        notice of why. See `farmGateway.ts`.
      */}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-700">What PUF-AM will accept.</span> A VPN address
        or an <span className="font-mono">https://</span> name. It will not accept a plain
        <span className="font-mono"> http://</span> address on the open internet — this tablet’s hub
        token would travel unencrypted, and pairing is what keeps other people out of the farm. A
        VPN such as Tailscale is free for a farm this size and encrypts the whole path.
      </p>

      {gatewayNeedsPairing && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-900">
            <KeyRound className="w-4 h-4" />
            Pair with this gateway
          </div>
          <p className="text-[11px] text-slate-600">
            {sync.gatewayIdentityChanged
              ? 'A different PUF-AM answered at that address, so this tablet’s pairing was not handed over. If you moved the farm to another machine, read the new pairing code off it.'
              : 'This tablet has not been introduced to that machine yet. On the farm laptop open Settings → Tablet hub and read out the pairing code. Once per tablet.'}
          </p>
          <div className="flex gap-2">
            <input
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              placeholder="K7M2-9Q4X"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 font-mono text-base tracking-widest uppercase"
            />
            <button
              type="button"
              disabled={!!busy || !pairingCode.trim()}
              onClick={() => {
                sync.pairGateway(pairingCode);
                setPairingCode('');
              }}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy === 'pair-gateway' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Pair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
