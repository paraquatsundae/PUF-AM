/**
 * When a native PUT is allowed to open a socket.
 *
 * 0.2.135 answers PutResponse after the Opennet insert. Sending while
 * N=0 is the 45s hang. Listening-only is not enough.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (Send native PUT settle).
 */

import type { FreenetHostMode } from './types.ts';

export const FREENET_PUT_NOT_LISTENING =
  'Freenet is not listening on this computer yet. Open Settings → Sync and wait until the node is up.';

export const FREENET_PUT_WAIT_OPENNET =
  'Wait until Settings → Sync says On Opennet, then Send. Publishing before peers join hangs until the network answers.';

export const FREENET_PUT_ALREADY_IN_PROGRESS =
  'A Send is already running. Wait for it to finish — do not press Send again.';

export function shouldEnforceFreenetPutReady(input: {
  reachable: boolean;
  mode: FreenetHostMode;
  hasChild: boolean;
}): boolean {
  if (input.reachable) return true;
  if (input.mode === 'managed' || input.mode === 'attached' || input.mode === 'starting') {
    return true;
  }
  return input.hasChild;
}

export function freenetPutReadyError(input: {
  reachable: boolean;
  peerCount?: number;
}): string | null {
  if (!input.reachable) return FREENET_PUT_NOT_LISTENING;
  if ((input.peerCount ?? 0) < 1) return FREENET_PUT_WAIT_OPENNET;
  return null;
}
