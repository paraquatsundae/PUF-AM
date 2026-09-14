/**
 * Electron quit buttons for the Freenet ask.
 * Keep is index 0 (default / cancel). Stop is index 1 and only valid for managed.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (ask before cutting Freenet).
 */

import {
  FREENET_QUIT_KEEP_LABEL,
  FREENET_QUIT_STOP_LABEL,
  quitStopsManagedFreenet,
  type FreenetQuitChoice,
} from '../units/puf-freenet-host/src/quit-ask.ts';
import type { FreenetHostMode } from '../units/puf-freenet-host/src/types.ts';

export const FREENET_QUIT_BUTTONS = [FREENET_QUIT_KEEP_LABEL, FREENET_QUIT_STOP_LABEL] as const;
export const FREENET_QUIT_DEFAULT_BUTTON = 0;

export function choiceFromQuitResponse(response: number): FreenetQuitChoice {
  return response === 1 ? 'stop' : 'keep';
}

/** What shutdown should do after the modal. Attached is never stopped. */
export function shutdownStopsFreenet(
  mode: FreenetHostMode | null | undefined,
  response: number,
): boolean {
  return quitStopsManagedFreenet(mode, choiceFromQuitResponse(response));
}
