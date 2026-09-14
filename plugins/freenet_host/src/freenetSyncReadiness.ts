/**
 * Sync-card readiness labels. Extracted so the card does not grow
 * (Plans/CODEBASE_HEALTH.md) and the copy can be tested.
 */

import type { FreenetHostStatus } from '../../../units/puf-freenet-host/src/types.ts';
import {
  FREENET_CREW_CANNOT_SEND,
  FREENET_DESKTOP_STARTING_LABEL,
  FREENET_NO_HOST_LABEL,
  FREENET_OWNER_SEND_NEEDS_NODE,
  FREENET_STARTING_LABEL,
  canReachFreenetNode,
  type FreenetRuntime,
} from '../../../src/lib/freenetRuntime.ts';
import { FREENET_LOCAL_NODE_LABEL } from '../../../src/mist/freenetLocalNode.ts';
import type { FreenetPeerStatus } from '../../../src/mist/mistFreenetClient.ts';

export type FreenetSyncReadiness = {
  ready: boolean;
  label: string;
  tone: 'ok' | 'wait' | 'todo';
};

export function hostIsUp(status: FreenetHostStatus | null): boolean {
  return status?.mode === 'managed' || status?.mode === 'attached';
}

export function describeFreenetSyncReadiness(input: {
  peer: FreenetPeerStatus | null;
  host: FreenetHostStatus | null;
  onDesktop: boolean;
  runtime: FreenetRuntime;
  lookingForHub: boolean;
  canStartOwnNode?: boolean;
}): FreenetSyncReadiness {
  if (!canReachFreenetNode(input.runtime)) {
    if (input.canStartOwnNode) {
      return { ready: false, label: FREENET_STARTING_LABEL, tone: 'wait' };
    }
    if (input.lookingForHub) {
      return {
        ready: false,
        label: 'Looking for a PUF-AM laptop on this Wi‑Fi…',
        tone: 'wait',
      };
    }
    return { ready: false, label: FREENET_NO_HOST_LABEL, tone: 'todo' };
  }
  if (input.peer?.freenet === 'connected') {
    return { ready: true, label: 'Connected to Freenet — ready to send or join.', tone: 'ok' };
  }
  if (input.runtime === 'android-local-node') {
    return { ready: true, label: FREENET_LOCAL_NODE_LABEL, tone: 'ok' };
  }
  if (input.peer?.freenet === 'connecting') {
    return { ready: false, label: 'Connecting to Freenet…', tone: 'wait' };
  }
  if (input.onDesktop && !hostIsUp(input.host)) {
    return {
      ready: false,
      label: FREENET_DESKTOP_STARTING_LABEL,
      tone: 'wait',
    };
  }
  return {
    ready: false,
    label: 'Freenet is running, but this farm is not connected to it.',
    tone: 'todo',
  };
}

export function freenetSendBlockedTitle(input: {
  canSend: boolean;
  hasNode: boolean;
  readOnly: boolean;
}): string {
  if (!input.canSend) return FREENET_CREW_CANNOT_SEND;
  if (!input.hasNode) return FREENET_NO_HOST_LABEL;
  if (input.readOnly) return FREENET_OWNER_SEND_NEEDS_NODE;
  return 'Connect to Freenet first';
}
