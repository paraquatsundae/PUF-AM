/**
 * Poll Freenet host status + optional JSON ring while the Settings section is mounted.
 *
 * One job: assemble the view model. Period is 8 s (FREENET_RING_POLL_MS).
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (Settings Freenet ring / traffic).
 */

import { useEffect, useState } from 'react';

import type { FarmNetworkPacksMap } from '../../shared/farm/networkPacks';
import { activeFarmPipe } from '../lib/farmPipes';
import {
  asFreenetContractTrafficList,
  mergeFreenetContractTraffic,
  subscribeFreenetContractTraffic,
  visibleFreenetContractTraffic,
  type FreenetContractTrafficEvent,
} from '../lib/freenetContractTraffic';
import { getFreenetHostCapability } from '../lib/freenetHostCapability';
import {
  FREENET_RING_POLL_MS,
  freenetOperatorStatus,
  freenetOperatorStatusDetail,
  freenetOperatorStatusLabel,
  freenetRingCaption,
  hostLooksUp,
  layoutFreenetRing,
  ringFromHost,
  shouldShowFreenetStatusSection,
  type FreenetOperatorStatus,
  type FreenetRingDot,
} from '../lib/freenetRingStatus';
import { hasMistDeviceSession } from '../mist/mistDeviceSession';
import { ensureFreenetHostFromSettingsCard } from '../mist/ensureFreenetHostListening';
import { androidFreenetHostStatusNow, isFreenetHostPluginAvailable } from '../lib/androidFreenetHost';
import { getDesktopBridge } from '../lib/desktopBridge';
import { isFreenetHostHoldOff } from '../lib/freenetHostHoldOff';
import type {
  FreenetHostMode,
  FreenetHostStatus,
  FreenetLeftoverKind,
} from '../../units/puf-freenet-host/src/types.ts';

export type FreenetRingView = {
  visible: boolean;
  status: FreenetOperatorStatus;
  label: string;
  detail: string;
  caption: string;
  dots: FreenetRingDot[];
  placement: 'locations' | 'count' | 'empty';
  peerCount: number;
  showRing: boolean;
  nodeVersion?: string;
  hostMode: FreenetHostMode | null;
  leftover: FreenetLeftoverKind | null;
  leftoverPackage?: string;
  /** Last N this-node PUT/GET flashes. Empty when idle — no fake arcs. */
  traffic: FreenetContractTrafficEvent[];
};

export type FreenetRingStatusDeps = {
  readHost?: () => Promise<FreenetHostStatus | null>;
  pollMs?: number;
  /** Tests: Settings card start/attach without the real host. */
  ensureHost?: () => Promise<void>;
};

async function defaultReadHost(): Promise<FreenetHostStatus | null> {
  const bridge = getDesktopBridge();
  if (bridge?.freenet?.status) {
    try {
      return await bridge.freenet.status();
    } catch {
      return null;
    }
  }
  if (isFreenetHostPluginAvailable()) {
    try {
      return await androidFreenetHostStatusNow({ probe: true });
    } catch {
      return null;
    }
  }
  return null;
}

function viewFrom(
  farmId: string | null | undefined,
  farmNetworkPacks: FarmNetworkPacksMap | null | undefined,
  host: FreenetHostStatus | null,
  pageTraffic: FreenetContractTrafficEvent[] = [],
  nowMs = Date.now(),
): FreenetRingView {
  const capability = getFreenetHostCapability();
  const pipe = activeFarmPipe(farmId);
  const ring = ringFromHost(host);
  const visible = shouldShowFreenetStatusSection({
    pipe,
    farmNetworkPacks,
    hasMistSession: hasMistDeviceSession(),
    hostUp: hostLooksUp(host),
  });
  const status = freenetOperatorStatus({ capability, host, ring });
  const layout = layoutFreenetRing({
    selfLocation: ring.location,
    peers: ring.peers,
    peerCount: ring.peerCount,
  });
  const showRing = visible && status !== 'browser' && status !== 'failed';
  const traffic = visibleFreenetContractTraffic(
    mergeFreenetContractTraffic(
      [...asFreenetContractTrafficList(host?.contractTraffic), ...pageTraffic],
      nowMs,
    ),
    nowMs,
  );
  return {
    visible,
    status,
    label: freenetOperatorStatusLabel(status),
    detail: freenetOperatorStatusDetail({ status, host, ring, capability }),
    caption: freenetRingCaption({
      status,
      placement: layout.placement,
      peerCount: ring.peerCount,
      peerSource: ring.peerSource,
    }),
    dots: layout.dots,
    placement: layout.placement,
    peerCount: ring.peerCount,
    showRing,
    hostMode: host?.leftover === 'ours' ? 'managed' : (host?.mode ?? null),
    leftover: host?.leftover ?? null,
    ...(host?.leftoverPackage ? { leftoverPackage: host.leftoverPackage } : {}),
    traffic,
    ...(ring.nodeVersion ? { nodeVersion: ring.nodeVersion } : {}),
  };
}

const HIDDEN: FreenetRingView = {
  visible: false,
  status: 'browser',
  label: '',
  detail: '',
  caption: '',
  dots: [],
  placement: 'empty',
  peerCount: 0,
  showRing: false,
  hostMode: null,
  leftover: null,
  traffic: [],
};

export function useFreenetRingStatus(
  farmId: string | null | undefined,
  farmNetworkPacks: FarmNetworkPacksMap | null | undefined,
  deps: FreenetRingStatusDeps = {},
): FreenetRingView {
  const [host, setHost] = useState<FreenetHostStatus | null>(null);
  const [pageTraffic, setPageTraffic] = useState<FreenetContractTrafficEvent[]>([]);
  const readHost = deps.readHost ?? defaultReadHost;
  const pollMs = deps.pollMs ?? FREENET_RING_POLL_MS;
  const ensureHost = deps.ensureHost;
  const cardShown = shouldShowFreenetStatusSection({
    pipe: activeFarmPipe(farmId),
    farmNetworkPacks,
    hasMistSession: hasMistDeviceSession(),
    hostUp: false,
  });

  useEffect(() => {
    if (!cardShown) return;
    if (isFreenetHostHoldOff()) return;
    void (ensureHost ?? (() => ensureFreenetHostFromSettingsCard(true)))();
  }, [cardShown, ensureHost]);

  useEffect(() => {
    return subscribeFreenetContractTraffic((event) => {
      setPageTraffic((prev) => mergeFreenetContractTraffic([event, ...prev]));
    });
  }, []);

  useEffect(() => {
    if (pageTraffic.length === 0 && !host?.contractTraffic?.length) return;
    const timer = window.setInterval(() => {
      setPageTraffic((prev) => visibleFreenetContractTraffic(prev));
    }, 400);
    return () => window.clearInterval(timer);
  }, [pageTraffic.length, host?.contractTraffic?.length]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const next = await readHost();
      if (!cancelled) setHost(next);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [readHost, pollMs]);

  return viewFrom(farmId, farmNetworkPacks, host, pageTraffic);
}

/** Tests and the presentational card — no poll. */
export function freenetRingViewForTests(
  farmId: string | null | undefined,
  farmNetworkPacks: FarmNetworkPacksMap | null | undefined,
  host: FreenetHostStatus | null,
  pageTraffic: FreenetContractTrafficEvent[] = [],
  nowMs?: number,
): FreenetRingView {
  return viewFrom(farmId, farmNetworkPacks, host, pageTraffic, nowMs);
}

export function hiddenFreenetRingView(): FreenetRingView {
  return HIDDEN;
}
