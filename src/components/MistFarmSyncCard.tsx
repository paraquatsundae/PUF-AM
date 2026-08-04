/**
 * Farm sync between two laptops — the operator-facing half of the mist workshop.
 *
 * `MistWorkshopCard` is the diagnostics surface: every knob, every hash, every
 * status string. This card is the *task*: send a farm from this laptop, or join
 * one from another. The two-laptop bench pass showed the flow works and the
 * scavenger hunt between cards is what makes it feel fragile, so everything one
 * job needs — readiness, the button, the ticket, the result — lives here in the
 * order it is done. Plan: `Plans/DESKTOP_FREENET_PLUGIN.md` §14 Phase 4.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  KeyRound,
  Loader2,
  Share2,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { getDesktopBridge } from '../lib/desktopBridge.ts';
import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import { isMistExperimentalEnabled } from '../mist/farmStoreBackend.ts';
import {
  fetchFreenetPeerStatus,
  publishFarmToFreenet,
  startFreenetPeer,
  type FreenetPeerStatus,
} from '../mist/mistFreenetClient.ts';
import {
  fetchAndRehydrateFarmFromFreenet,
  refreshFarmUiAfterRecovery,
} from '../mist/mistDisasterRecovery.ts';
import { formatJoinTicket, parseJoinTicketInput } from '../mist/mistJoinTicket.ts';
import { getMistHotPublishStatus, isMistHotMirrorAvailable } from '../mist/mistHotBridge.ts';

type Mode = 'send' | 'join';

type Readiness = {
  ready: boolean;
  /** One plain sentence: what is true now, or what to do about it. */
  label: string;
  tone: 'ok' | 'wait' | 'todo';
};

function hostIsUp(status: FreenetHostStatus | null): boolean {
  return status?.mode === 'managed' || status?.mode === 'attached';
}

function describeReadiness(
  peer: FreenetPeerStatus | null,
  host: FreenetHostStatus | null,
  onDesktop: boolean,
): Readiness {
  if (peer?.freenet === 'connected') {
    return { ready: true, label: 'Connected to Freenet — ready to send or join.', tone: 'ok' };
  }
  if (peer?.freenet === 'connecting') {
    return { ready: false, label: 'Connecting to Freenet…', tone: 'wait' };
  }
  if (onDesktop && !hostIsUp(host)) {
    return {
      ready: false,
      label: 'Freenet is not running on this computer yet.',
      tone: 'todo',
    };
  }
  return { ready: false, label: 'Freenet is running, but this farm is not connected to it.', tone: 'todo' };
}

/** The last ticket this device published, rebuilt from saved publish metadata. */
function savedJoinTicket(farmId: string | undefined): string {
  const status = farmId ? getMistHotPublishStatus(farmId) : null;
  if (!status?.freenetUri || !status.bonesFreenetUri) return '';
  return formatJoinTicket({
    v: 1,
    hotUri: status.freenetUri,
    bonesUri: status.bonesFreenetUri,
    hotContentHash: status.contentHash,
    bonesContentHash: status.bonesContentHash,
  });
}

const TONE_CLASS: Record<Readiness['tone'], string> = {
  ok: 'text-emerald-800 bg-emerald-50 border-emerald-200',
  wait: 'text-amber-800 bg-amber-50 border-amber-200',
  todo: 'text-slate-700 bg-slate-50 border-slate-200',
};

export function MistFarmSyncCard() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const desktop = getDesktopBridge();

  const [mode, setMode] = useState<Mode>('send');
  const [modePinned, setModePinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [peerStatus, setPeerStatus] = useState<FreenetPeerStatus | null>(null);
  const [hostStatus, setHostStatus] = useState<FreenetHostStatus | null>(null);
  const [autoStart, setAutoStart] = useState<boolean | null>(null);
  const [autoStartForced, setAutoStartForced] = useState(false);

  const [ticket, setTicket] = useState('');
  const [ticketCopied, setTicketCopied] = useState(false);
  const [paste, setPaste] = useState('');
  const [unlocked, setUnlocked] = useState(() => isMistHotMirrorAvailable());

  const refreshStatus = useCallback(async () => {
    try {
      setPeerStatus(await fetchFreenetPeerStatus());
    } catch {
      setPeerStatus(null);
    }
  }, []);

  useEffect(() => {
    setUnlocked(isMistHotMirrorAvailable());
    void refreshStatus();
  }, [farmId, refreshStatus]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    bridge.freenet.status().then(setHostStatus).catch(() => setHostStatus(null));
    bridge.mist
      ?.getPreference()
      .then((pref) => {
        setAutoStart(pref.enabled);
        setAutoStartForced(pref.forcedByEnv);
      })
      .catch(() => setAutoStart(null));
    return bridge.freenet.onState(setHostStatus);
  }, []);

  /**
   * A laptop that has never published anything is almost certainly the one
   * joining, which is the moment the old flow was worst. Guess once, and stop
   * guessing as soon as the operator picks for themselves.
   */
  useEffect(() => {
    if (modePinned || !farmId) return;
    setMode(getMistHotPublishStatus(farmId)?.freenetUri ? 'send' : 'join');
  }, [farmId, modePinned]);

  if (!isMistExperimentalEnabled()) return null;

  const readiness = describeReadiness(peerStatus, hostStatus, Boolean(desktop));
  const parsedPaste = parseJoinTicketInput(paste);
  const publishedTicket = ticket || savedJoinTicket(farmId);

  const pickMode = (next: Mode) => {
    setModePinned(true);
    setMode(next);
    setMessage(null);
    setError(null);
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  /** One button for the whole "is this thing on" problem: node, then peer. */
  const connect = () =>
    run(async () => {
      const bridge = getDesktopBridge();
      if (bridge && !hostIsUp(hostStatus)) {
        const started = await bridge.freenet.start();
        setHostStatus(started);
        if (!started?.reachable) {
          throw new Error(
            started?.lastError ?? 'Freenet did not start — check Mist workshop below for details',
          );
        }
      }
      const status = await startFreenetPeer({ contribute: false });
      setPeerStatus(status);
      setMessage(
        status.freenet === 'connected'
          ? 'Connected. This laptop can now send or receive a farm.'
          : 'Freenet started. It can take a few minutes to find peers the first time — try again shortly.',
      );
    });

  const onAutoStartChange = (next: boolean) =>
    run(async () => {
      const bridge = getDesktopBridge();
      if (!bridge?.mist) return;
      const pref = await bridge.mist.setPreference(next);
      setAutoStart(pref.enabled);
      setAutoStartForced(pref.forcedByEnv);
      if (pref.host) setHostStatus(pref.host);
      setMessage(
        pref.enabled
          ? 'Freenet will start with PUF-AM from now on.'
          : 'Freenet will stay off at launch. You can still start it here when you need it.',
      );
      await refreshStatus();
    });

  const publish = () =>
    run(async () => {
      if (!farmId) return;
      const result = await publishFarmToFreenet(farmId);
      setTicket(result.joinTicketText);
      setMessage('Farm sent to Freenet. Copy the join ticket below and take it to the other laptop.');
      await refreshStatus();
    });

  const copyTicket = () =>
    run(async () => {
      if (!publishedTicket) return;
      await navigator.clipboard.writeText(publishedTicket);
      setTicketCopied(true);
      setTimeout(() => setTicketCopied(false), 2000);
    });

  const pasteFromClipboard = () =>
    run(async () => {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('Clipboard is empty');
      setPaste(text);
    });

  const fetchFarm = () =>
    run(async () => {
      if (!farmId || !parsedPaste) return;
      const result = await fetchAndRehydrateFarmFromFreenet(farmId, paste);
      await refreshFarmUiAfterRecovery(farmId);
      const diary = result.hot.after.diary;
      const blocks = result.geometry.after.blocks;
      setMessage(
        `Farm received — ${diary} diary ${diary === 1 ? 'entry' : 'entries'} and ${blocks} ${
          blocks === 1 ? 'block' : 'blocks'
        } are now on this laptop. Open the Orchard map to check.`,
      );
    });

  return (
    <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Farm sync between laptops</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Move a whole farm — diary, issues, boundaries — to another computer over Freenet.
            Everything is encrypted on this laptop before it leaves. Experimental; Firebase farms
            are unaffected.
          </p>
        </div>
      </div>

      <div className={`text-xs rounded-xl border px-3 py-2.5 flex items-center gap-2 ${TONE_CLASS[readiness.tone]}`}>
        {readiness.ready ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : busy ? (
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
        ) : null}
        <span className="flex-1">{readiness.label}</span>
        {!readiness.ready && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void connect()}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 shrink-0"
          >
            Connect
          </button>
        )}
      </div>

      {desktop && autoStart !== null && (
        <label className="flex items-start gap-2.5 text-xs text-slate-700 px-1">
          <input
            type="checkbox"
            checked={autoStart || autoStartForced}
            disabled={busy || autoStartForced}
            onChange={(e) => void onAutoStartChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-emerald-700"
          />
          <span>
            Start Freenet when PUF-AM opens
            <span className="block text-[11px] text-slate-500">
              {autoStartForced
                ? 'Forced on for this launch by MIST_FREENET in the environment.'
                : 'Remembered between launches. Leave it off and PUF-AM behaves like a normal Firebase install.'}
            </span>
          </span>
        </label>
      )}

      {!farmId || !unlocked ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          Sign in to a mist farm and unlock it on this device before sending or joining. On a new
          laptop, use <strong>Recover with FarmCode</strong> on the login screen first.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => pickMode('send')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium ${
                mode === 'send'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4" />
              Send this farm
            </button>
            <button
              type="button"
              onClick={() => pickMode('join')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium ${
                mode === 'join'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" />
              Join a farm
            </button>
          </div>

          {mode === 'send' ? (
            <div className="space-y-3">
              <button
                type="button"
                disabled={busy || !readiness.ready}
                title={readiness.ready ? undefined : 'Connect to Freenet first'}
                onClick={() => void publish()}
                className="w-full px-3 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Send this farm to Freenet
              </button>

              {publishedTicket ? (
                <div className="space-y-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-emerald-900">Join ticket</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void copyTicket()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {ticketCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="font-mono text-[10px] text-emerald-900/80 whitespace-pre-wrap break-all max-h-28 overflow-auto">
                    {publishedTicket}
                  </pre>
                </div>
              ) : null}

              <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 space-y-1.5">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  The other laptop needs three things
                </p>
                <ol className="list-decimal ml-4 space-y-1 text-slate-600">
                  <li>
                    <strong>The FarmCode</strong> — the words written down when this farm was
                    created. It is not stored anywhere PUF-AM can show you again.
                  </li>
                  <li>
                    <strong>The device PIN</strong> for that FarmCode.
                  </li>
                  <li>
                    <strong>This join ticket</strong> — copy it above. A new one is issued every
                    time you send, so use the latest.
                  </li>
                </ol>
                <p className="text-[11px] text-slate-500">
                  Freenet can take several minutes to make a fresh publish reachable from another
                  machine. If the other laptop says it cannot find the farm, wait and try again.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="mist-join-ticket">
                    Paste the join ticket from the other laptop
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pasteFromClipboard()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-50"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Paste
                  </button>
                </div>
                <textarea
                  id="mist-join-ticket"
                  rows={4}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder='{ "v": 1, "hotUri": "FN02@…", "bonesUri": "FN02@…" }'
                  className="w-full text-[11px] font-mono px-2.5 py-2 rounded-lg border border-slate-200"
                />
                {paste.trim() ? (
                  <p className={`text-[11px] ${parsedPaste ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {parsedPaste
                      ? 'Ticket looks good — both addresses found.'
                      : 'That does not look like a join ticket yet. Paste the whole thing, braces included.'}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                disabled={busy || !parsedPaste || !peerStatus?.running}
                title={
                  !parsedPaste
                    ? 'Paste the join ticket first'
                    : peerStatus?.running
                      ? undefined
                      : 'Connect to Freenet first'
                }
                onClick={() => void fetchFarm()}
                className="w-full px-3 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Fetch the farm
              </button>

              <p className="text-[11px] text-slate-500">
                This pulls the diary, issues, and map boundaries onto this laptop and decrypts them
                with the FarmCode you recovered with. Nothing is sent back.
              </p>
            </div>
          )}
        </>
      )}

      {message ? (
        <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          {error}
        </p>
      ) : null}
    </div>
  );
}
