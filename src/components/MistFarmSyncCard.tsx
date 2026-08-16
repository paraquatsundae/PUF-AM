/**
 * Settings → Sync → the Freenet half, on farms that have one.
 *
 * `MistWorkshopCard` is the diagnostics surface: every knob, every hash, every
 * status string, and bench-only since the Settings split. This card is the
 * *task*: send a farm from this device, or join one from another. The
 * two-laptop bench pass showed the flow works and the scavenger hunt between
 * cards is what makes it feel fragile, so everything one job needs —
 * readiness, the button, the ticket, the result — lives here in the order it is
 * done.
 *
 * Rendered only for Freenet farms — see `src/lib/farmPipes.ts`.
 *
 * Plans: `Plans/DESKTOP_FREENET_PLUGIN.md` §14 Phase 4 ·
 * `Plans/SETTINGS_SYNC_AND_CREW.md` §1.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  KeyRound,
  Loader2,
  Share2,
  Wifi,
} from 'lucide-react';

import { FreenetHowItWorksButton } from './FreenetHowItWorks';
import { useAuth } from '../contexts/AuthContext';
import { APP_NAME } from '../brand';
import { getDesktopBridge, isDesktopShell } from '../lib/desktopBridge.ts';
import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import {
  DEFAULT_JOIN_ROLE,
  JOIN_TICKET_PREFIX,
  formatJoinTicketInput,
  isJoinTicket,
  joinRoleLabel,
  type JoinRole,
} from '../../shared/sync/joinTicket.ts';
import {
  findJoinPreset,
  joinPresetsForFarm,
  type JoinPreset,
  type JoinPresetId,
} from '../../shared/sync/joinGrant.ts';
import {
  MODULE_LABELS,
  CHILL_PACK_MODULES,
  WALNUT_PACK_MODULES,
  type FarmModuleId,
} from '../../shared/auth/farmModules.ts';
import { useWalnutPack } from '../hooks/useWalnutPack';
import { useChillPack } from '../hooks/useChillPack';
import { isMistExperimentalEnabled } from '../mist/farmStoreBackend.ts';
import {
  FREENET_NO_HOST_DETAIL,
  FREENET_NO_HOST_LABEL,
  canReachFreenetNode,
  detectFreenetReadOnly,
  detectFreenetRuntime,
  refreshFreenetRuntime,
  type FreenetRuntime,
} from '../lib/freenetRuntime.ts';
import {
  FREENET_LOCAL_NODE_DETAIL,
  FREENET_LOCAL_NODE_LABEL,
} from '../mist/freenetLocalNode.ts';
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
import { joinFarmWithShortTicket } from '../mist/mistJoinWithTicket.ts';
import { resolveJoinTicket } from '../mist/joinTicketResolver.ts';
import { formatJoinTicket, parseJoinTicketInput } from '../mist/mistJoinTicket.ts';
import {
  getMistHotPublishStatus,
  isMistHotMirrorAvailable,
  mistPublishNeedsDevicePin,
} from '../mist/mistHotBridge.ts';
import { getMistJoinState, mistSessionNeedsPin } from '../mist/mistDeviceSession.ts';
import { fetchSyncSelf } from '../lib/mdnsPeers.ts';
import { ensureSyncHub } from '../lib/syncHub.ts';

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
  runtime: FreenetRuntime,
  lookingForHub: boolean,
): Readiness {
  // Checked before the peer status because on Android there is no node to have a
  // status: offering Connect here would be a button that can only ever fail.
  if (!canReachFreenetNode(runtime)) {
    if (lookingForHub) {
      return {
        ready: false,
        label: 'Looking for a PUF-AM laptop on this Wi‑Fi…',
        tone: 'wait',
      };
    }
    return { ready: false, label: FREENET_NO_HOST_LABEL, tone: 'todo' };
  }
  if (peer?.freenet === 'connected') {
    return { ready: true, label: 'Connected to Freenet — ready to send or join.', tone: 'ok' };
  }
  // A node app on this device is already up or it would not have answered the
  // probe, so there is nothing here to connect and no peer status to wait for.
  if (runtime === 'android-local-node') {
    return { ready: true, label: FREENET_LOCAL_NODE_LABEL, tone: 'ok' };
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

/** The raw FN02 ticket this device published — diagnostics and offline-LAN fallback. */
function savedFreenetTicket(farmId: string | undefined): string {
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

/**
 * A ticket this card is willing to put on screen. Only ever built from one the
 * hub has answered for — see `shortTicket` on `PublishFarmToFreenetResult`.
 */
type SentTicket = {
  ticket: string;
  role: JoinRole;
  preset?: JoinPresetId;
  expires?: string;
};

/**
 * What to call a ticket on screen. The preset is the word the owner actually
 * chose ("Field only"); the role is all a ticket minted before presets can say.
 */
function ticketGrantLabel(sent: SentTicket): string {
  return findJoinPreset(sent.preset)?.label ?? joinRoleLabel(sent.role);
}

function savedShortTicket(farmId: string | undefined): SentTicket | null {
  const status = farmId ? getMistHotPublishStatus(farmId) : null;
  if (!status?.joinTicket) return null;
  return {
    ticket: status.joinTicket,
    role: status.joinTicketRole ?? DEFAULT_JOIN_ROLE,
    ...(status.joinTicketPreset ? { preset: status.joinTicketPreset } : {}),
    expires: status.joinTicketExpires,
  };
}

/** The nav entries a preset hands over, in the operator's words. */
function describePresetModules(preset: JoinPreset): string {
  const named = preset.modules
    .filter((m: FarmModuleId) => m !== 'dashboard')
    .map((m: FarmModuleId) => MODULE_LABELS[m]);
  if (!named.length) return 'Dashboard only';
  return named.join(' · ');
}

const TONE_CLASS: Record<Readiness['tone'], string> = {
  ok: 'text-emerald-800 bg-emerald-50 border-emerald-200',
  wait: 'text-amber-800 bg-amber-50 border-amber-200',
  todo: 'text-slate-700 bg-slate-50 border-slate-200',
};

export function MistFarmSyncCard() {
  const { userData, farmEnabledModules } = useAuth();
  const farmId = userData?.farmId;
  const desktop = getDesktopBridge();
  const hasWalnutPack = useWalnutPack();
  const hasChillPack = useChillPack();

  /**
   * Same filter the invite-PIN screen uses, so a farm with no walnut pack is
   * never offered a Crop scout ticket whose whole point is blight.
   */
  const presets = useMemo(
    () =>
      joinPresetsForFarm(farmEnabledModules, {
        excludeModules: [
          ...(hasWalnutPack ? [] : WALNUT_PACK_MODULES),
          ...(hasChillPack ? [] : CHILL_PACK_MODULES),
        ],
      }),
    [farmEnabledModules, hasWalnutPack, hasChillPack],
  );

  /**
   * On a tablet the answer to "is there a node" is not known at first paint: it
   * depends on whether a LAN hub turns up. Re-read the runtime once the lookup
   * settles instead of leaving the card on its no-host label for the session.
   */
  const [lookingForHub, setLookingForHub] = useState(() => !isDesktopShell());
  const [runtime, setRuntime] = useState<FreenetRuntime>(detectFreenetRuntime);
  useEffect(() => {
    // Both lookups answer the same question — where is the node — and both are
    // async, so the card starts on whatever is already known and settles.
    void Promise.allSettled([ensureSyncHub(), refreshFreenetRuntime()]).then(() => {
      setRuntime(detectFreenetRuntime());
      setLookingForHub(false);
    });
  }, []);
  const hasNode = canReachFreenetNode(runtime);

  /**
   * A Freenet node on this tablet can fetch a farm but not publish one: PUT still
   * goes through `fdev`, which is a laptop-only binary. Sending stays available
   * when a hub is also paired, because that laptop can still do it.
   */
  const readOnly = detectFreenetReadOnly(runtime);

  const [mode, setMode] = useState<Mode>('send');
  const [modePinned, setModePinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [peerStatus, setPeerStatus] = useState<FreenetPeerStatus | null>(null);
  const [hostStatus, setHostStatus] = useState<FreenetHostStatus | null>(null);
  const [autoStart, setAutoStart] = useState<boolean | null>(null);
  const [autoStartForced, setAutoStartForced] = useState(false);

  const [sentTicket, setSentTicket] = useState<SentTicket | null>(null);
  /** A remembered ticket the hub no longer answers for — shown as a warning, not a ticket. */
  const [staleTicket, setStaleTicket] = useState<string | null>(null);
  const [sharePresetId, setSharePresetId] = useState<JoinPresetId>('full_farmer');
  /** Who this ticket is for — the only thing that turns the People list into names. */
  const [shareLabel, setShareLabel] = useState('');
  const selectedPreset = presets.find((p) => p.id === sharePresetId) ?? presets[0] ?? null;
  const [ticketCopied, setTicketCopied] = useState(false);
  const [freenetTicketShown, setFreenetTicketShown] = useState(false);
  const [lanAddress, setLanAddress] = useState<string | null>(null);

  const [joinTicket, setJoinTicket] = useState('');
  const [ownerBase, setOwnerBase] = useState('');
  const [ownerBaseShown, setOwnerBaseShown] = useState(false);
  const [devicePin, setDevicePin] = useState('');
  const [needsPin] = useState(() => mistSessionNeedsPin());
  /**
   * Narrower than `needsPin`: the farm is sealed *and* nothing has opened it in
   * this tab. Normally false, because unlocking on the way in keeps the seed in
   * hand — this only fires on a device that reached Settings without one.
   */
  const [sendNeedsPin, setSendNeedsPin] = useState(() => mistPublishNeedsDevicePin());
  const [paste, setPaste] = useState('');
  const [pasteShown, setPasteShown] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isMistHotMirrorAvailable());

  const refreshStatus = useCallback(async () => {
    // There is no Freenet API to poll on an APK with no hub, and a failed fetch
    // would only overwrite the honest label with a generic disconnected one. The
    // same goes for a tablet reading off its own node: peer status is a hub's
    // notion, and this device is not asking a hub for anything.
    if (!hasNode || readOnly) return;
    try {
      setPeerStatus(await fetchFreenetPeerStatus());
    } catch {
      setPeerStatus(null);
    }
  }, [hasNode, readOnly]);

  useEffect(() => {
    setUnlocked(isMistHotMirrorAvailable());
    setSendNeedsPin(mistPublishNeedsDevicePin());
    void refreshStatus();

    // A remembered ticket only proves this device minted one once. The hub's
    // shelf is a separate file that a restart, a prune or an expiry can empty,
    // and re-showing a ticket it has forgotten sends the operator to read out a
    // dead code. Prove it still resolves before it goes back on screen.
    const saved = savedShortTicket(farmId);
    setSentTicket(null);
    setStaleTicket(null);
    if (!saved || !farmId) return;

    let cancelled = false;
    void resolveJoinTicket(saved.ticket, farmId)
      .then(() => {
        if (!cancelled) setSentTicket(saved);
      })
      .catch(() => {
        if (!cancelled) setStaleTicket(saved.ticket);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId, refreshStatus]);

  /** The address a joiner types when their device cannot find this hub by itself. */
  useEffect(() => {
    void fetchSyncSelf()
      .then(({ self, lanIpv4 }) => {
        const ip = lanIpv4[0];
        setLanAddress(self?.baseUrl?.replace(/^https?:\/\//, '') || (ip ? `${ip}:3000` : null));
      })
      .catch(() => setLanAddress(null));
  }, []);

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
    if (getMistJoinState()?.joinTicketDeferred) {
      setMode('join');
      return;
    }
    setMode(getMistHotPublishStatus(farmId)?.freenetUri ? 'send' : 'join');
  }, [farmId, modePinned]);

  if (!isMistExperimentalEnabled()) return null;

  const readiness = describeReadiness(
    peerStatus,
    hostStatus,
    Boolean(desktop),
    runtime,
    lookingForHub,
  );
  const blockedTitle = !hasNode
    ? FREENET_NO_HOST_LABEL
    : readOnly
      ? 'Sending a farm needs a PUF-AM laptop — this tablet can only fetch one'
      : 'Connect to Freenet first';
  const parsedPaste = parseJoinTicketInput(paste);
  const freenetTicket = savedFreenetTicket(farmId);
  const joinTicketLooksRight = isJoinTicket(joinTicket);

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
            started?.lastError ?? 'Freenet did not start on this computer.',
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
      // A farm that dropped this preset from its catalog since it was picked
      // would otherwise publish a ticket granting nothing.
      const preset = presets.find((p) => p.id === sharePresetId) ?? presets[0];
      if (!preset) throw new Error('This farm has no crew role to share yet.');
      const pin = devicePin.trim();
      if (sendNeedsPin && pin.length < 4) {
        throw new Error('Enter this device\u2019s PIN to unlock the farm before sending it.');
      }
      const result = await publishFarmToFreenet(farmId, {
        preset,
        ...(pin ? { devicePin: pin } : {}),
        ...(shareLabel.trim() ? { label: shareLabel.trim() } : {}),
      });
      // The seed is in hand for the rest of this tab's life, so the PIN field
      // has done its job and should stop being asked for.
      setSendNeedsPin(mistPublishNeedsDevicePin());
      if (!result.shortTicket) {
        // The farm is on Freenet either way, but a short ticket the hub cannot
        // answer for is worse than none: the operator reads it out, the joiner
        // gets "No hub on this WIFI knows that join ticket", and the ticket looks
        // like the innocent party. Fail loudly and point at the working handoff.
        setSentTicket(null);
        setStaleTicket(null);
        await refreshStatus();
        throw new Error(
          `Farm is on Freenet, but this device could not put a join ticket on its hub, so there is no short ticket to read out — ${
            result.shortTicketError ?? 'the hub did not accept it'
          }. Use the Freenet ticket under Advanced below to hand this farm over.`,
        );
      }
      setStaleTicket(null);
      setSentTicket({
        ticket: result.shortTicket,
        role: result.shortTicketRole,
        ...(result.shortTicketPreset ? { preset: result.shortTicketPreset } : {}),
        expires: result.shortTicketExpires,
      });
      setMessage('Farm sent to Freenet. Read the join ticket below out to whoever is joining.');
      await refreshStatus();
    });

  const copyTicket = (text: string) =>
    run(async () => {
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setTicketCopied(true);
      setTimeout(() => setTicketCopied(false), 2000);
    });

  const pasteFromClipboard = () =>
    run(async () => {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('Clipboard is empty');
      setPaste(text);
    });

  const describeReceived = (diary: number, blocks: number) =>
    `Farm received — ${diary} diary ${diary === 1 ? 'entry' : 'entries'} and ${blocks} ${
      blocks === 1 ? 'block' : 'blocks'
    } are now on this device. Open the Orchard map to check.`;

  const joinWithTicket = () =>
    run(async () => {
      if (!farmId || !joinTicketLooksRight) return;
      try {
        const result = await joinFarmWithShortTicket({
          farmId,
          ticket: joinTicket,
          ...(ownerBase.trim() ? { ownerBase: ownerBase.trim() } : {}),
          ...(devicePin.trim() ? { devicePin: devicePin.trim() } : {}),
        });
        const joinedAs =
          findJoinPreset(result.grant.preset)?.label ?? joinRoleLabel(result.grant.role);
        setMessage(`${describeReceived(result.diary, result.blocks)} Joined as ${joinedAs}.`);
      } catch (err) {
        setOwnerBaseShown(true);
        throw err;
      }
    });

  /** Fallback for a joiner who is not on the owner's Wi‑Fi but has the raw URIs. */
  const fetchFarmFromFreenetTicket = () =>
    run(async () => {
      if (!farmId || !parsedPaste) return;
      const result = await fetchAndRehydrateFarmFromFreenet(farmId, paste);
      await refreshFarmUiAfterRecovery(farmId);
      setMessage(describeReceived(result.hot.after.diary, result.geometry.after.blocks));
    });

  return (
    <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
          <Share2 className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Send or join a farm over Freenet</h2>
            <FreenetHowItWorksButton />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Move a whole farm — diary, issues, boundaries — to a device that is not on this Wi‑Fi.
            Everything is encrypted here before it leaves. Experimental.
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
        {!readiness.ready && hasNode && !readOnly && (
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

      {!hasNode && (
        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
          {FREENET_NO_HOST_DETAIL}
        </p>
      )}

      {readOnly && (
        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
          {FREENET_LOCAL_NODE_DETAIL}
        </p>
      )}

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
          Sign in to this farm and unlock it on this device before sending or joining. On a new
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
              <div className="space-y-1.5">
                <label htmlFor="mist-share-label" className="text-xs font-semibold text-slate-700">
                  Who is this for?
                </label>
                <input
                  id="mist-share-label"
                  value={shareLabel}
                  disabled={busy}
                  maxLength={60}
                  onChange={(e) => setShareLabel(e.target.value)}
                  placeholder="Dave — spray ute"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
                <p className="text-[11px] text-slate-500">
                  Only for your own list under <strong>Farm setup → People</strong> — it stays on
                  this computer and is not sent with the farm.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mist-share-preset" className="text-xs font-semibold text-slate-700">
                  What this ticket grants
                </label>
                <select
                  id="mist-share-preset"
                  value={sharePresetId}
                  disabled={busy}
                  onChange={(e) => setSharePresetId(e.target.value as JoinPresetId)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                >
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                {selectedPreset ? (
                  <p className="text-[11px] text-slate-500">
                    {describePresetModules(selectedPreset)}. They also get Settings on their own
                    device, so they can re-join or sync over Wi‑Fi without you.
                  </p>
                ) : null}
              </div>

              {sendNeedsPin ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="mist-send-device-pin"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Device PIN
                  </label>
                  <input
                    id="mist-send-device-pin"
                    value={devicePin}
                    onChange={(e) => setDevicePin(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    type="password"
                    autoComplete="off"
                    placeholder="••••"
                    className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50 font-mono text-center tracking-[0.3em]"
                  />
                  <p className="text-[11px] text-amber-800">
                    This farm is still sealed on this device. The PIN unlocks it so the farm can be
                    encrypted for Freenet — it is the same one you use to open {APP_NAME}, not the
                    FarmCode.
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                disabled={
                  busy ||
                  !readiness.ready ||
                  readOnly ||
                  (sendNeedsPin && devicePin.trim().length < 4)
                }
                title={
                  readiness.ready && !readOnly
                    ? sendNeedsPin && devicePin.trim().length < 4
                      ? 'Enter this device’s PIN first'
                      : undefined
                    : blockedTitle
                }
                onClick={() => void publish()}
                className="w-full px-3 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Send this farm to Freenet
              </button>

              {sentTicket ? (
                <div className="space-y-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-emerald-900">
                      Join ticket · {ticketGrantLabel(sentTicket)}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void copyTicket(sentTicket.ticket)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {ticketCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="font-mono text-xl font-bold tracking-[0.15em] text-emerald-900 text-center py-1 select-all">
                    {sentTicket.ticket}
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    Short enough to read out or write on a whiteboard — no clipboard needed on a
                    phone.
                    {sentTicket.expires
                      ? ` Stops working ${new Date(sentTicket.expires).toLocaleDateString()}.`
                      : null}
                  </p>
                  <p className="text-[11px] font-semibold text-emerald-950 bg-white/70 border border-emerald-200 rounded-lg px-2 py-1.5">
                    Give them the paper FarmCode <strong>and</strong> this ticket. The ticket by
                    itself will not open the farm.
                  </p>
                </div>
              ) : null}

              {staleTicket ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  The join ticket this device handed out last time is no longer on its hub, so it
                  will not work for anyone. Send the farm again to get a fresh one.
                </p>
              ) : null}

              <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 space-y-1.5">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Give them two things
                </p>
                <p className="text-[11px] text-slate-600">
                  The ticket by itself will not open the farm. They must already have the paper
                  FarmCode.
                </p>
                <ol className="list-decimal ml-4 space-y-1 text-slate-600">
                  <li>
                    <strong>The paper FarmCode</strong> — written down when this farm was created.
                    The app cannot show it again.
                  </li>
                  <li>
                    <strong>This join ticket</strong>. A new one is issued every time you send, so
                    use the latest.
                  </li>
                </ol>
                <p className="text-[11px] text-slate-500">
                  If they set a device PIN when they recovered, they type that on their device. If
                  they skipped it, they leave that field blank. That PIN is not the one that unlocks
                  Send on this laptop.
                </p>
                <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                  <Wifi className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Keep this computer on and on the same Wi‑Fi while they join — the ticket is
                    looked up here.
                    {lanAddress ? (
                      <>
                        {' '}
                        If their device cannot find it, give them this address:{' '}
                        <code className="font-mono">{lanAddress}</code>.
                      </>
                    ) : null}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Freenet can take several minutes to make a fresh publish reachable from another
                  machine. If the other device says it cannot find the farm, wait and try again.
                </p>
              </div>

              {freenetTicket ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setFreenetTicketShown((v) => !v)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                  >
                    {freenetTicketShown ? 'Hide' : 'Advanced —'} raw Freenet ticket (FN02)
                  </button>
                  {freenetTicketShown ? (
                    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-600">
                          Works without Wi‑Fi to this computer, but has to be copied whole.
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void copyTicket(freenetTicket)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </button>
                      </div>
                      <pre className="font-mono text-[10px] text-slate-600 whitespace-pre-wrap break-all max-h-28 overflow-auto">
                        {freenetTicket}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700" htmlFor="mist-short-ticket">
                  Join ticket from the farm owner
                </label>
                <input
                  id="mist-short-ticket"
                  value={joinTicket}
                  onChange={(e) => setJoinTicket(formatJoinTicketInput(e.target.value))}
                  placeholder={`${JOIN_TICKET_PREFIX}-K7M2-9Q4X`}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 font-mono tracking-[0.2em] text-center uppercase"
                />
                {joinTicket.trim() && !joinTicketLooksRight ? (
                  <p className="text-[11px] text-amber-700">
                    A join ticket is eight characters after the prefix, like{' '}
                    <code className="font-mono">{JOIN_TICKET_PREFIX}-K7M2-9Q4X</code>.
                  </p>
                ) : null}
              </div>

              {needsPin ? (
                <div className="space-y-1.5">
                  <label htmlFor="mist-join-device-pin" className="text-xs font-semibold text-slate-700">
                    Device PIN
                  </label>
                  <input
                    id="mist-join-device-pin"
                    value={devicePin}
                    onChange={(e) => setDevicePin(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    type="password"
                    autoComplete="off"
                    placeholder="••••"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono text-center tracking-[0.3em]"
                  />
                  <p className="text-[11px] text-slate-500">
                    Needed to look a ticket up over Freenet — the slot it sits in is addressed off
                    the FarmCode this PIN unlocks.
                  </p>
                </div>
              ) : null}

              {ownerBaseShown ? (
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
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500">
                    Only needed when this device cannot find the owner&apos;s computer by itself.
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                disabled={busy || !joinTicketLooksRight || !peerStatus?.running}
                title={
                  !joinTicketLooksRight
                    ? 'Enter the join ticket first'
                    : peerStatus?.running
                      ? undefined
                      : blockedTitle
                }
                onClick={() => void joinWithTicket()}
                className="w-full px-3 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Join this farm
              </button>

              <p className="text-[11px] text-slate-500">
                Be on the <strong>same Wi‑Fi as the farm owner</strong> — that is how the ticket is
                looked up. The farm itself comes over Freenet, encrypted, and is decrypted here with
                the FarmCode you recovered with. Nothing is sent back.
              </p>

              <div className="space-y-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasteShown((v) => !v)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  {pasteShown ? 'Hide' : 'Advanced —'} paste a raw Freenet ticket (FN02) instead
                </button>

                {pasteShown ? (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          className="text-[11px] font-semibold text-slate-600"
                          htmlFor="mist-join-ticket"
                        >
                          Freenet ticket JSON
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
                        <p
                          className={`text-[11px] ${parsedPaste ? 'text-emerald-700' : 'text-amber-700'}`}
                        >
                          {parsedPaste
                            ? 'Ticket looks good — both addresses found.'
                            : 'That does not look like a Freenet ticket yet. Paste the whole thing, braces included.'}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      disabled={busy || !parsedPaste || !peerStatus?.running}
                      onClick={() => void fetchFarmFromFreenetTicket()}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Fetch the farm from Freenet URIs
                    </button>
                  </>
                ) : null}
              </div>
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
