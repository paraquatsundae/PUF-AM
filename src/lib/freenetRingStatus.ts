/**
 * Freenet Settings section — visibility, honest status labels, ring layout.
 *
 * Pure. The hook polls; this file does not fetch.
 * Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14 (Settings Freenet ring / traffic).
 */

import type { FarmNetworkPacksMap } from '../../shared/farm/networkPacks';
import { isFarmFreenetHostEnabled } from '../../shared/farm/networkPacks';
import type { FarmPipe } from './farmPipes';
import type { FreenetHostCapability } from './freenetHostCapability';
import type {
  FreenetAttachKind,
  FreenetHostMode,
  FreenetHostStatus,
  FreenetLeftoverKind,
  FreenetNodeRingInfo,
  FreenetRingPeer,
} from '../../units/puf-freenet-host/src/types.ts';

export const FREENET_RING_POLL_MS = 8_000;

export const FREENET_BROWSER_ONLY_COPY =
  'Freenet runs on desktop or the PUF-AM app, not in the browser.';

/** Leftover AppImage mount — only when the listener is another PUF-AM binary. */
export const FREENET_ATTACHED_OTHER_APPIMAGE_DETAIL =
  'A Freenet 0.2 node was already on :7509 — often an older PUF-AM AppImage still open. This bake attached and did not start its bundled binary. Quit the other PUF-AM if you wanted this install to host. A verified Freenet Android Node is left running.';

/** User systemd / `~/.local/share/freenet` / unknown third-party — not “older AppImage”. */
export const FREENET_ATTACHED_ALREADY_RUNNING_DETAIL =
  'Freenet was already running on this computer (not this AppImage). This bake attached and did not start its bundled binary. That node is left running.';

/** Foreign leftover on the APK — not “already open” as if PUF-AM failed. */
export const FREENET_ATTACHED_ALREADY_RUNNING_ANDROID_DETAIL =
  'Another Freenet is on :7509 on this device (not this app’s bundled node, and not a LAN hub). PUF-AM attached. Use Stop Freenet on this device for PUF-AM’s leftover node.';

/** Freenet Android Node — we cannot force-stop that app. */
export const FREENET_ATTACHED_ANDROID_NODE_DETAIL =
  'Freenet Android Node is still on :7509 on this device — we cannot force-stop it. Open that app to stop it there.';

export type FreenetOperatorStatus =
  | 'starting'
  | 'listening'
  | 'opennet'
  | 'attached'
  | 'failed'
  | 'browser';

export const FREENET_OPERATOR_STATUS_LABEL: Record<FreenetOperatorStatus, string> = {
  starting: 'Starting',
  listening: 'Listening.',
  opennet: 'On Opennet',
  attached: 'Attached (another node on :7509)',
  failed: 'Failed',
  browser: FREENET_BROWSER_ONLY_COPY,
};

/**
 * N=0 or no `ring_connections=` / `connection_count=` line yet.
 * Do not say “not connected” — the node may still be joining.
 */
export const FREENET_LOG_JOINING_COPY = 'joining / no ring peers in the log yet.';

/** @deprecated Use FREENET_LOG_JOINING_COPY — 0.2.135 count comes from logs. */
export const FREENET_OPENNET_UNREPORTED_DETAIL = FREENET_LOG_JOINING_COPY;

/** @deprecated Use FREENET_LOG_JOINING_COPY */
export const FREENET_OPENNET_UNREPORTED_CAPTION = FREENET_LOG_JOINING_COPY;

export type FreenetRingDot = {
  key: string;
  kind: 'self' | 'peer';
  /** Radians, 0 = top of the ring. */
  angle: number;
  location?: number;
};

export type FreenetStatusSectionInput = {
  pipe: FarmPipe;
  farmNetworkPacks?: FarmNetworkPacksMap | null;
  hasMistSession: boolean;
  hostUp: boolean;
};

/** Hosted-only cloud farm with no pack, no mist session, no live node → hide. */
export function shouldShowFreenetStatusSection(input: FreenetStatusSectionInput): boolean {
  if (input.pipe === 'freenet' || input.pipe === 'hybrid') return true;
  if (isFarmFreenetHostEnabled(input.farmNetworkPacks)) return true;
  if (input.hasMistSession) return true;
  return input.hostUp;
}

export function hostLooksUp(status: FreenetHostStatus | null | undefined): boolean {
  if (!status) return false;
  if (status.reachable) return true;
  return status.mode === 'starting' || status.mode === 'managed' || status.mode === 'attached';
}

export function isBrowserFreenetShell(capability: FreenetHostCapability): boolean {
  return capability === null;
}

/**
 * One honest status. Attached wins over listening/Opennet so a third-party
 * node is not described as the bundled one. On Opennet needs N≥1 from JSON
 * or this bake's log (`ring_connections=` / `connection_count=`). N=0 or no
 * line yet stays Listening — do not claim “not connected”.
 */
export function freenetOperatorStatus(input: {
  capability: FreenetHostCapability;
  host: FreenetHostStatus | null;
  ring?: FreenetNodeRingInfo | null;
}): FreenetOperatorStatus {
  const mode: FreenetHostMode | undefined = input.host?.mode;
  if (mode === 'failed') return 'failed';
  if (input.capability === null && !hostLooksUp(input.host)) return 'browser';
  if (mode === 'starting' || (mode === 'stopped' && !input.host?.reachable)) return 'starting';
  if (!input.host) return input.capability ? 'starting' : 'browser';
  if (mode === 'attached' && input.host?.leftover !== 'ours') return 'attached';
  if (input.host.reachable) {
    const peers = input.ring?.peerCount ?? input.host.nodeRing?.peerCount ?? 0;
    return peers > 0 ? 'opennet' : 'listening';
  }
  if (mode === 'managed') return 'starting';
  return 'starting';
}

export function freenetOperatorStatusLabel(status: FreenetOperatorStatus): string {
  return FREENET_OPERATOR_STATUS_LABEL[status];
}

export function freenetAttachedDetail(
  kind: FreenetAttachKind | undefined,
  capability?: FreenetHostCapability | null,
  leftover?: FreenetLeftoverKind | null,
): string {
  if (leftover === 'ours') return '';
  if (leftover === 'android-node') return FREENET_ATTACHED_ANDROID_NODE_DETAIL;
  if (kind === 'other-appimage') return FREENET_ATTACHED_OTHER_APPIMAGE_DETAIL;
  if (capability === 'android') return FREENET_ATTACHED_ALREADY_RUNNING_ANDROID_DETAIL;
  return FREENET_ATTACHED_ALREADY_RUNNING_DETAIL;
}

export function freenetOperatorStatusDetail(input: {
  status: FreenetOperatorStatus;
  host: FreenetHostStatus | null;
  ring?: FreenetNodeRingInfo | null;
  capability?: FreenetHostCapability | null;
}): string {
  if (input.status === 'browser') return '';
  if (input.status === 'failed') {
    return input.host?.lastError?.trim() || 'The Freenet node on this device did not start.';
  }
  if (input.status === 'starting') {
    return 'The node is coming up. Opennet can take a few minutes.';
  }
  if (input.status === 'attached') {
    const n = input.ring?.peerCount ?? input.host?.nodeRing?.peerCount ?? 0;
    const stale = freenetAttachedDetail(input.host?.attachKind, input.capability, input.host?.leftover);
    if (!stale) {
      return n > 0
        ? n === 1
          ? 'This node is on Opennet (1 peer).'
          : `This node is on Opennet (${n} peers).`
        : FREENET_LOG_JOINING_COPY;
    }
    if (n > 0) {
      return n === 1 ? `${stale} This node is on Opennet (1 peer).` : `${stale} This node is on Opennet (${n} peers).`;
    }
    return `${stale} ${FREENET_LOG_JOINING_COPY}`;
  }
  if (input.status === 'listening') {
    return FREENET_LOG_JOINING_COPY;
  }
  const n = input.ring?.peerCount ?? input.host?.nodeRing?.peerCount ?? 0;
  return n === 1 ? 'This node is on Opennet (1 peer).' : `This node is on Opennet (${n} peers).`;
}

function clampLocation(location: number): number {
  if (!Number.isFinite(location)) return 0;
  const wrapped = location - Math.floor(location);
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** 0 at the top, clockwise. */
export function ringAngleFromLocation(location: number): number {
  return clampLocation(location) * Math.PI * 2 - Math.PI / 2;
}

export function layoutFreenetRing(input: {
  selfLocation?: number;
  peers: FreenetRingPeer[];
  peerCount: number;
}): { dots: FreenetRingDot[]; placement: 'locations' | 'count' | 'empty' } {
  const selfLocation = input.selfLocation;
  const locatedPeers = input.peers.filter((p) => p.location !== undefined);
  if (selfLocation !== undefined || locatedPeers.length > 0) {
    const dots: FreenetRingDot[] = [
      {
        key: 'self',
        kind: 'self',
        angle: ringAngleFromLocation(selfLocation ?? 0),
        ...(selfLocation !== undefined ? { location: selfLocation } : {}),
      },
    ];
    locatedPeers.forEach((peer, i) => {
      const loc = peer.location as number;
      dots.push({
        key: peer.id ? `peer-${peer.id}` : `peer-loc-${i}`,
        kind: 'peer',
        angle: ringAngleFromLocation(loc),
        location: loc,
      });
    });
    return { dots, placement: 'locations' };
  }

  const n = Math.max(0, Math.floor(input.peerCount));
  const dots: FreenetRingDot[] = [
    { key: 'self', kind: 'self', angle: ringAngleFromLocation(0) },
  ];
  if (n === 0) return { dots, placement: 'empty' };
  for (let i = 0; i < n; i += 1) {
    const slot = (i + 1) / (n + 1);
    dots.push({
      key: input.peers[i]?.id ? `peer-${input.peers[i].id}` : `peer-${i}`,
      kind: 'peer',
      angle: ringAngleFromLocation(slot),
    });
  }
  return { dots, placement: 'count' };
}

export function freenetRingCaption(input: {
  status: FreenetOperatorStatus;
  placement: 'locations' | 'count' | 'empty';
  peerCount: number;
  peerSource?: FreenetNodeRingInfo['peerSource'];
}): string {
  if (input.status === 'browser') return '';
  if (input.peerSource === 'unreported' || input.placement === 'empty' || input.peerCount === 0) {
    return FREENET_LOG_JOINING_COPY;
  }
  if (input.placement === 'locations') {
    return input.peerCount === 1
      ? '1 peer on the ring.'
      : `${input.peerCount} peers on the ring.`;
  }
  return input.peerCount === 1
    ? '1 peer (positions not reported by this node).'
    : `${input.peerCount} peers (positions not reported by this node).`;
}

export function ringFromHost(host: FreenetHostStatus | null | undefined): FreenetNodeRingInfo {
  const ring = host?.nodeRing;
  if (ring) return ring;
  return { peers: [], peerCount: 0, peerSource: 'unreported' };
}
