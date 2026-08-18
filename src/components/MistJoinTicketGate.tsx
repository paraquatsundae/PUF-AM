/**
 * "Enter join ticket" — the first thing laptop B sees after FarmCode recovery.
 *
 * FarmCode recovery re-derives the farm's identity but brings no data, and the
 * old flow dropped the operator into an empty farm and left them to find the
 * right card in Settings. So the ticket is asked for here, immediately, and the
 * app stays behind this screen until the farm arrives.
 *
 * There is one way past it without a ticket: an operator who is out of Wi‑Fi
 * range still needs to get in to download an offline basemap pack, so
 * "look around first" defers the gate rather than pretending it is optional.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Loader2, Ticket, Wifi } from 'lucide-react';

import { FreenetHowItWorksButton } from './FreenetHowItWorks';
import { useAuth } from '../contexts/AuthContext';
import { isMistExperimentalEnabled } from '../mist/farmStoreBackend.ts';
import { isMistFarmSessionActive } from '../mist/mistFarmSession.ts';
import {
  deferMistJoinTicket,
  getMistJoinState,
  getMistSessionMeta,
  mistSessionNeedsPin,
} from '../mist/mistDeviceSession.ts';
import { joinFarmWithShortTicket } from '../mist/mistJoinWithTicket.ts';
import {
  JOIN_TICKET_PREFIX,
  formatJoinTicketInput,
  isJoinTicket,
  joinRoleLabel,
} from '../../shared/sync/joinTicket.ts';
import { findJoinPreset } from '../../shared/sync/joinGrant.ts';
import {
  fetchFreenetPeerStatus,
  startFreenetPeer,
  type FreenetPeerStatus,
} from '../mist/mistFreenetClient.ts';
import {
  canReachFreenetNode,
  detectFreenetRuntime,
  freenetReadsLocally,
  refreshFreenetRuntime,
  shouldPollHubPeerStatus,
  FREENET_NO_HOST_DETAIL,
  FREENET_NO_HOST_LABEL,
  type FreenetRuntime,
} from '../lib/freenetRuntime.ts';
import { FREENET_LOCAL_NODE_LABEL } from '../mist/freenetLocalNode.ts';

export function MistJoinTicketGate({ children }: { children: React.ReactNode }) {
  const { userData, logout } = useAuth();
  const farmId = userData?.farmId;

  const [pending, setPending] = useState(() => Boolean(getMistJoinState()?.joinTicketPending));
  const [ticket, setTicket] = useState('');
  const [ownerBase, setOwnerBase] = useState('');
  const [showOwnerBase, setShowOwnerBase] = useState(false);
  const [devicePin, setDevicePin] = useState('');
  const [needsPin] = useState(() => mistSessionNeedsPin());
  const [peer, setPeer] = useState<FreenetPeerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Where the node this device would talk to lives. A tablet with no hub has
  // none, so asking it for peer status is a fetch at an address nothing answers.
  // A tablet beside a Freenet node app has one *here*, which is better than a
  // hub for joining and needs no warm-up at all.
  const [runtime, setRuntime] = useState<FreenetRuntime>(detectFreenetRuntime);
  const [runtimeSettled, setRuntimeSettled] = useState(false);
  const freenetReachable = canReachFreenetNode(runtime);
  const localNode = freenetReadsLocally(runtime);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    void refreshFreenetRuntime()
      .then((next) => {
        if (!cancelled) setRuntime(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRuntimeSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  useEffect(() => {
    // `peer/status` is a question for a hub. There is no hub in the local-node
    // case and nothing on this device answers that route — and until the probe
    // has settled we cannot yet tell which case this is.
    if (!pending || !shouldPollHubPeerStatus({ runtime, settled: runtimeSettled })) return;
    void fetchFreenetPeerStatus()
      .then(setPeer)
      .catch(() => setPeer(null));
  }, [pending, runtime, runtimeSettled]);

  const meta = getMistSessionMeta();
  const ticketLooksRight = useMemo(() => isJoinTicket(ticket), [ticket]);

  // A Firebase sign-in on a device that once held a mist farm must never see this.
  if (!pending || !isMistExperimentalEnabled() || !isMistFarmSessionActive() || !farmId) {
    return <>{children}</>;
  }

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      setPeer(await startFreenetPeer({ contribute: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to Freenet');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Warming the node up first is a courtesy, not a precondition. It used to
      // be `await`ed bare, so a tablet with a remembered hub it can no longer
      // reach failed the whole join on `POST /api/mist/freenet/peer/start` and
      // never tried a single resolver — including the LAN one, which needs no
      // Freenet at all. Whatever the resolvers cannot do, they say so themselves.
      // Skipped outright when the node is on this device: `peer/start` would go
      // to a hub this join does not need, and a paired-but-absent laptop must not
      // be able to hold up a join that never involved it.
      if (freenetReachable && !localNode && peer?.freenet !== 'connected') {
        try {
          setPeer(await startFreenetPeer({ contribute: false }));
        } catch {
          /* Reported by whichever resolver actually needed a node. */
        }
      }
      const result = await joinFarmWithShortTicket({
        farmId,
        ticket,
        ...(ownerBase.trim() ? { ownerBase: ownerBase.trim() } : {}),
        ...(devicePin.trim() ? { devicePin: devicePin.trim() } : {}),
      });
      const joinedAs =
        findJoinPreset(result.grant.preset)?.label ?? joinRoleLabel(result.grant.role);
      setMessage(
        `Joined as ${joinedAs} — ${result.diary} diary ${
          result.diary === 1 ? 'entry' : 'entries'
        } and ${result.blocks} ${result.blocks === 1 ? 'block' : 'blocks'} are on this device.`,
      );
      setPending(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not join the farm';
      setError(text);
      setShowOwnerBase(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-emerald-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <Ticket className="w-7 h-7 text-emerald-700" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Enter join ticket</h1>
          <p className="text-sm text-slate-600">
            {meta?.farmName ? (
              <>
                <strong>{meta.farmName}</strong> is recovered on this device, but it has no farm data
                yet.
              </>
            ) : (
              <>This device has the farm&apos;s identity, but no farm data yet.</>
            )}
          </p>
          <p className="text-xs text-slate-500">
            You already typed the paper FarmCode. This ticket is the second piece — ask the farm
            owner for the short code from their <strong>Send this farm</strong> screen. It looks
            like <code className="font-mono">{JOIN_TICKET_PREFIX}-K7M2-9Q4X</code>.
          </p>
          <div className="pt-1">
            <FreenetHowItWorksButton />
          </div>
        </div>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        {message && (
          <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {message}
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <input
            value={ticket}
            onChange={(e) => setTicket(formatJoinTicketInput(e.target.value))}
            placeholder={`${JOIN_TICKET_PREFIX}-K7M2-9Q4X`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Join ticket"
            className="w-full px-3 py-3 border border-slate-200 rounded-xl font-mono tracking-[0.2em] text-center text-lg uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />

          {needsPin && (
            <div className="space-y-1.5">
              <label htmlFor="mist-join-pin" className="text-xs font-semibold text-slate-700">
                Device PIN
              </label>
              <input
                id="mist-join-pin"
                value={devicePin}
                onChange={(e) => setDevicePin(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="off"
                type="password"
                placeholder="••••"
                aria-label="Device PIN"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-center tracking-[0.3em]"
              />
              <p className="text-[11px] text-slate-500">
                The PIN you set when you recovered this farm. A ticket looked up over Freenet is
                found at an address derived from the FarmCode, so this device has to be unlocked to
                work out where to look.
              </p>
            </div>
          )}

          {showOwnerBase && (
            <div className="space-y-1.5">
              <label htmlFor="mist-owner-base" className="text-xs font-semibold text-slate-700">
                Owner&apos;s address on this Wi‑Fi
              </label>
              <input
                id="mist-owner-base"
                value={ownerBase}
                onChange={(e) => setOwnerBase(e.target.value)}
                placeholder="192.168.1.20:3000"
                spellCheck={false}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-sm"
              />
              <p className="text-[11px] text-slate-500">
                Only needed when this device cannot find the owner&apos;s computer by itself. They
                can read it off <strong>Settings → Farm sync</strong>.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !ticketLooksRight}
            title={ticketLooksRight ? undefined : 'Enter the ticket first'}
            className="w-full py-3 rounded-xl bg-emerald-700 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            Join this farm
          </button>
        </form>

        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <Wifi className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {localNode ? (
              <>
                <strong>{FREENET_LOCAL_NODE_LABEL}</strong> A ticket is looked up on the{' '}
                <strong>farm owner&apos;s laptop</strong> if this device can see it, and otherwise on{' '}
                <strong>Freenet</strong> through the node app on this tablet. The farm itself always
                travels over Freenet, encrypted.
              </>
            ) : freenetReachable ? (
              <>
                A ticket is looked up on the <strong>farm owner&apos;s laptop</strong> first, and on{' '}
                <strong>Freenet</strong> if this device cannot see it. The farm itself always travels
                over Freenet, encrypted.
              </>
            ) : (
              <>
                <strong>{FREENET_NO_HOST_LABEL}</strong> {FREENET_NO_HOST_DETAIL}
              </>
            )}
            {freenetReachable && !localNode && peer && peer.freenet !== 'connected' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void connect()}
                className="ml-1 font-semibold text-emerald-700 hover:underline disabled:opacity-50"
              >
                Connect Freenet
              </button>
            ) : null}
          </span>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              deferMistJoinTicket();
              setPending(false);
            }}
            className="w-full text-xs text-slate-500 hover:text-slate-800"
          >
            Look around first — I&apos;ll join later (offline maps still download)
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full text-xs text-slate-400 hover:text-slate-700"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
