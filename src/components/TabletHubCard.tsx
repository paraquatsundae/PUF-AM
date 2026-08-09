/**
 * Settings → **Tablet hub**: turn this laptop into the shed's hub for tablets.
 *
 * The desktop shell serves its UI on loopback behind a per-launch token, which is
 * the right answer for the app itself and useless to a tablet. This card is the
 * operator-facing half of the second, LAN-bound listener: a switch, one pairing
 * code to read out, the addresses to type when multicast is blocked, and the list
 * of tablets that have paired.
 *
 * Desktop-only by construction — the bridge does not exist anywhere else, so the
 * card returns `null` in a browser and on the APK rather than offering something
 * that cannot work.
 *
 * @see Plans/DESKTOP_FREENET_PLUGIN.md §6.4
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  Loader2,
  RefreshCw,
  Router,
  Tablet,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { clsx } from 'clsx';

import { getDesktopBridge, type DesktopLanHubState } from '../lib/desktopBridge';

function formatSeen(iso?: string): string {
  if (!iso) return 'not seen yet';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'not seen yet';
  return when.toLocaleString();
}

export function TabletHubCard() {
  const bridge = getDesktopBridge();
  const lanHub = bridge?.lanHub;

  const [state, setState] = useState<DesktopLanHubState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!lanHub) return;
    try {
      setState(await lanHub.state());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [lanHub]);

  useEffect(() => {
    void load();
    // Pairing happens on the tablet, so the laptop finds out by being told —
    // main pushes state when a device pairs rather than the card polling for it.
    return lanHub?.onState((next) => setState(next));
  }, [lanHub, load]);

  const run = async (label: string, fn: () => Promise<DesktopLanHubState>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      setState(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!lanHub) return null;

  const enabled = state?.enabled ?? false;
  const running = state?.running ?? false;
  const addresses = state?.baseUrls ?? [];

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-sky-50 rounded-xl">
          <Router className="w-5 h-5 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Tablet hub</h2>
          <p className="text-sm text-slate-500">
            Let other PUF-AM devices on this Wi‑Fi sync through this laptop — farm sync, join
            tickets and Freenet. <span className="font-medium">On by default</span>, so sync finds
            this laptop without anyone setting it up; each tablet is paired once with the code
            below. Turn it off and nothing on the network can reach this machine.
          </p>
        </div>
        <span
          className={clsx(
            'shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
            running
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-slate-50 text-slate-500 border-slate-200',
          )}
        >
          {running ? 'On' : 'Off'}
        </span>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {message && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          {message}
        </div>
      )}
      {state?.lastError && (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Could not open the LAN port: {state.lastError}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">Serve tablets on this Wi‑Fi</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {running
              ? `Listening on port ${state?.port}${state?.advertising ? ' · advertising itself' : ''}`
              : 'Nothing on the network can reach this laptop while this is off.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={busy !== null || state?.forcedByEnv}
          onClick={() =>
            void run('toggle', async () => {
              const next = await lanHub.setEnabled(!enabled);
              setMessage(
                !enabled
                  ? 'Tablet hub on. Read the pairing code out to the tablet.'
                  : 'Tablet hub off.',
              );
              return next;
            })
          }
          className={clsx(
            'shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
            enabled ? 'bg-emerald-600' : 'bg-slate-300',
          )}
        >
          <span
            className={clsx(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>
      {state?.forcedByEnv && (
        <p className="text-[11px] text-slate-500">
          <code className="text-[10px]">PUF_LAN_HUB=1</code> forced this on for this launch, so the
          switch is fixed until the app restarts.
        </p>
      )}

      {running && (
        <>
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-slate-800">Pairing code</p>
            <p className="text-xs text-slate-500">
              Read this out to the tablet once, in{' '}
              <span className="font-medium">Settings → Sync → Wi‑Fi (LAN)</span>. It buys the tablet
              scoped access to this hub — not to the farm, which still needs its FarmCode and
              device PIN.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 px-3 py-3 rounded-xl bg-slate-900 text-white text-2xl font-bold tracking-[0.2em] text-center">
                {state?.pairingCode || '————————'}
              </code>
              <button
                type="button"
                title="Copy pairing code"
                onClick={() => {
                  if (state?.pairingCode) void navigator.clipboard.writeText(state.pairingCode);
                  setMessage('Pairing code copied');
                }}
                className="shrink-0 p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="New pairing code"
                disabled={busy !== null}
                onClick={() =>
                  void run('rotate', async () => {
                    const next = await lanHub.rotatePairingCode();
                    setMessage(
                      'New pairing code. Tablets already paired keep working — remove them below to cut them off.',
                    );
                    return next;
                  })
                }
                className="shrink-0 p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-50"
              >
                {busy === 'rotate' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              {addresses.length ? (
                <Wifi className="w-4 h-4 text-emerald-600" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-600" />
              )}
              Give them this address
            </div>
            {addresses.length ? (
              <ul className="space-y-1">
                {addresses.map((base, index) => (
                  <li
                    key={base}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2"
                  >
                    <span className="font-mono text-sm text-slate-800 min-w-0 break-all">
                      {base.replace(/^https?:\/\//, '')}
                      {index === 0 && addresses.length > 1 ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-emerald-700">
                          try first
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      title="Copy address"
                      onClick={() => void navigator.clipboard.writeText(base)}
                      className="shrink-0 p-1 text-slate-400 hover:text-slate-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-amber-900">
                This laptop has no local network address right now — join the shed Wi‑Fi and turn
                the hub off and on again.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Most tablets find this laptop on their own. Typing the address is the fallback for
              networks that block multicast — some phone hotspots and most guest Wi‑Fi.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Tablet className="w-4 h-4 text-slate-500" />
              Paired devices
            </div>
            {state?.devices.length ? (
              <ul className="space-y-2">
                {state.devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{device.name}</p>
                      <p className="text-[11px] text-slate-500">
                        paired {formatSeen(device.pairedAt)} · last seen {formatSeen(device.lastSeenAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      title="Remove this device"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(`forget:${device.id}`, async () => {
                          const next = await lanHub.forgetDevice(device.id);
                          setMessage(`${device.name} removed — it will have to pair again.`);
                          return next;
                        })
                      }
                      className="shrink-0 p-2 text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      {busy === `forget:${device.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">
                No tablets yet. On the tablet, open Settings → Sync → Wi‑Fi (LAN) and enter the
                pairing code above.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
