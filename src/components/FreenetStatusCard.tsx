/**
 * Settings → Sync — Freenet node status, ring, and device kill switch.
 *
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (Settings Freenet ring).
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (kill switch).
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Radio } from 'lucide-react';

import { FREENET_ANDROID_ATTACHED_NOTE } from '../../units/puf-freenet-host/src/quit-ask.ts';
import {
  FREENET_ANDROID_NODE_PACKAGE,
  FREENET_KILL_SWITCH_HINT,
  FREENET_KILL_SWITCH_LABEL,
  FREENET_OPEN_ANDROID_NODE_LABEL,
  FREENET_START_ON_DEVICE_LABEL,
  FREENET_STOP_USER_SERVICE_ASK,
  FREENET_STOP_USER_SERVICE_CONFIRM,
  killSwitchHonestMessage,
  shouldConfirmStopUserService,
  shouldOfferKillSwitch,
  shouldOfferStartFreenet,
} from '../../units/puf-freenet-host/src/kill-switch.ts';
import type { FreenetKillSwitchResult } from '../../units/puf-freenet-host/src/types.ts';
import { useAuth } from '../contexts/AuthContext';
import { useFreenetRingStatus, type FreenetRingView } from '../hooks/useFreenetRingStatus';
import { androidOpenFreenetAndroidNode } from '../lib/androidFreenetHost.ts';
import {
  clearFreenetHostHoldOff,
  isFreenetHostHoldOff,
  subscribeFreenetHostHoldOff,
} from '../lib/freenetHostHoldOff.ts';
import { freenetKillSwitchCopy, stopFreenetOnThisDevice } from '../lib/stopFreenetOnDevice.ts';
import { startFreenetOnThisDevice } from '../mist/ensureFreenetHostListening.ts';
import { FreenetPeerRing } from './FreenetPeerRing';

export function FreenetStatusPanel({
  view,
  onStop,
  onStart,
  onOpenAndroidNode,
  onConfirmUserService,
  onCancelUserService,
  stopping,
  starting,
  holdOff,
  kill,
  askUserService,
}: {
  view: FreenetRingView;
  onStop?: () => void;
  onStart?: () => void;
  onOpenAndroidNode?: () => void;
  onConfirmUserService?: () => void;
  onCancelUserService?: () => void;
  stopping?: boolean;
  starting?: boolean;
  holdOff?: boolean;
  kill?: FreenetKillSwitchResult | null;
  askUserService?: boolean;
}) {
  if (!view.visible) return null;
  const leftover = kill?.leftover ?? view.leftover ?? null;
  const showStop = Boolean(onStop) && shouldOfferKillSwitch(view.hostMode, leftover);
  const showStart =
    Boolean(onStart) && shouldOfferStartFreenet(view.hostMode, Boolean(holdOff), leftover);
  const showAttachedNote = view.hostMode === 'attached' && leftover !== 'android-node';
  const leftoverCopy =
    leftover && leftover !== 'none'
      ? kill
        ? freenetKillSwitchCopy(kill)
        : killSwitchHonestMessage({ leftover, stoppedOurs: true })
      : null;
  const showOpenAndroid =
    leftover === 'android-node' || view.leftoverPackage === FREENET_ANDROID_NODE_PACKAGE;

  return (
    <section
      data-testid="freenet-status-section"
      aria-labelledby="freenet-status-heading"
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-violet-50">
          <Radio className="w-5 h-5 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="freenet-status-heading" className="text-lg font-bold text-slate-900">
            Freenet
          </h2>
          <p data-testid="freenet-status-label" className="text-sm font-semibold text-violet-800 mt-1">
            {view.label}
          </p>
          {view.detail ? (
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{view.detail}</p>
          ) : null}
          {view.nodeVersion && (
            <p className="text-xs text-slate-400 mt-1 font-mono">Node {view.nodeVersion}</p>
          )}
        </div>
      </div>

      {view.showRing && (
        <div className="border-t border-slate-100 pt-4">
          <FreenetPeerRing
            dots={view.dots}
            placement={view.placement}
            peerCount={view.peerCount}
            traffic={view.traffic}
          />
          {view.caption && (
            <p data-testid="freenet-ring-caption" className="text-center text-xs text-slate-500 mt-2">
              {view.caption}
            </p>
          )}
        </div>
      )}

      {showAttachedNote && (
        <p data-testid="freenet-attached-leave" className="text-sm text-slate-600 leading-relaxed">
          {FREENET_ANDROID_ATTACHED_NOTE}
        </p>
      )}
      {leftoverCopy ? (
        <p data-testid="freenet-kill-result" className="text-sm text-slate-700 leading-relaxed">
          {leftoverCopy}
        </p>
      ) : null}

      <p className="text-xs text-slate-500 leading-relaxed">{FREENET_KILL_SWITCH_HINT}</p>

      {askUserService ? (
        <div
          data-testid="freenet-stop-service-ask"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3"
        >
          <p className="text-sm text-amber-950">{FREENET_STOP_USER_SERVICE_ASK}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="freenet-stop-service-confirm"
              onClick={onConfirmUserService}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-semibold"
            >
              {FREENET_STOP_USER_SERVICE_CONFIRM}
            </button>
            <button
              type="button"
              data-testid="freenet-stop-service-cancel"
              onClick={onCancelUserService}
              className="inline-flex items-center px-4 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold"
            >
              Leave it running
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-2">
        {showStop && (
          <button
            type="button"
            data-testid="freenet-stop-managed"
            disabled={stopping || starting}
            onClick={onStop}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-950 text-sm font-bold disabled:opacity-50"
          >
            {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {FREENET_KILL_SWITCH_LABEL}
          </button>
        )}
        {showStart && (
          <button
            type="button"
            data-testid="freenet-start-device"
            disabled={stopping || starting}
            onClick={onStart}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 text-sm font-semibold disabled:opacity-50"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {FREENET_START_ON_DEVICE_LABEL}
          </button>
        )}
        {showOpenAndroid && onOpenAndroidNode ? (
          <button
            type="button"
            data-testid="freenet-open-android-node"
            onClick={onOpenAndroidNode}
            className="inline-flex items-center justify-center px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold"
          >
            {FREENET_OPEN_ANDROID_NODE_LABEL}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function FreenetStatusCard() {
  const { userData, farmNetworkPacks } = useAuth();
  const view = useFreenetRingStatus(userData?.farmId, farmNetworkPacks);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [holdOff, setHoldOff] = useState(() => isFreenetHostHoldOff());
  const [kill, setKill] = useState<FreenetKillSwitchResult | null>(null);
  const [askUserService, setAskUserService] = useState(false);

  useEffect(() => subscribeFreenetHostHoldOff(() => setHoldOff(isFreenetHostHoldOff())), []);

  const runStop = (stopUserService: boolean) => {
    setStopping(true);
    void stopFreenetOnThisDevice({ stopUserService })
      .then((result) => {
        setKill(result);
        setHoldOff(true);
        setAskUserService(shouldConfirmStopUserService(result.leftover, stopUserService));
      })
      .finally(() => setStopping(false));
  };

  return (
    <FreenetStatusPanel
      view={view}
      stopping={stopping}
      starting={starting}
      holdOff={holdOff}
      kill={kill}
      askUserService={askUserService}
      onStop={() => runStop(false)}
      onStart={() => {
        setStarting(true);
        setAskUserService(false);
        clearFreenetHostHoldOff();
        setHoldOff(false);
        setKill(null);
        void startFreenetOnThisDevice().finally(() => setStarting(false));
      }}
      onOpenAndroidNode={() => {
        void androidOpenFreenetAndroidNode();
      }}
      onConfirmUserService={() => {
        setAskUserService(false);
        runStop(true);
      }}
      onCancelUserService={() => setAskUserService(false)}
    />
  );
}
