/**
 * Ask before cutting Freenet — Keep (default) vs Stop this bake's child.
 *
 * Stop is only for `managed` / `starting`. `attached` is another Freenet
 * (workshop, leftover mount, Freenet Android Node) and is never killed.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (ask before cutting Freenet).
 */

import type { FreenetHostMode } from './types.ts';

export type FreenetQuitAskKind = 'none' | 'managed' | 'attached';
export type FreenetQuitChoice = 'keep' | 'stop';

export const FREENET_QUIT_ASK_TITLE = 'Freenet is still running on this computer';
export const FREENET_QUIT_KEEP_LABEL = 'Keep running';
export const FREENET_QUIT_STOP_LABEL = 'Stop Freenet';
export const FREENET_QUIT_MANAGED_DETAIL =
  'Keep running: the next PUF-AM will attach to this node. Stop Freenet: stop only the node this bake started, so the next launch can start a new one.';
export const FREENET_ATTACHED_LEAVE_TITLE = 'This is another Freenet';
export const FREENET_ATTACHED_LEAVE_BODY = 'This is another Freenet. Leave it running.';
export const FREENET_ATTACHED_LEAVE_BUTTON = 'Leave it running';
export const FREENET_ANDROID_STOP_LABEL = 'Stop Freenet on this device';
export const FREENET_ANDROID_ATTACHED_NOTE =
  'This is another Freenet. We will not stop their app.';

export function freenetQuitAskKind(
  mode: FreenetHostMode | null | undefined,
): FreenetQuitAskKind {
  if (mode === 'managed' || mode === 'starting') return 'managed';
  if (mode === 'attached') return 'attached';
  return 'none';
}

/** Settings / leave-farm Stop — only a node we spawned. */
export function shouldOfferStopFreenet(mode: FreenetHostMode | null | undefined): boolean {
  return freenetQuitAskKind(mode) === 'managed';
}

/**
 * After the operator picks a button. Attached and nothing-running never stop,
 * even if the UI sent `stop`.
 */
export function quitStopsManagedFreenet(
  mode: FreenetHostMode | null | undefined,
  choice: FreenetQuitChoice,
): boolean {
  return shouldOfferStopFreenet(mode) && choice === 'stop';
}
