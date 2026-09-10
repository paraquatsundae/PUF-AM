/**
 * Can this shell host a Freenet node of its own?
 *
 * The network pack (Plans/NETWORK_PACK_PLUGIN.md § Host capability) asks this
 * one question and nothing else about the shell: with a capability it may start
 * and stop a node and offer Freenet on the start screen; without one it shows
 * *not available on this device* and the login option is hidden. That is
 * decision 5 of Plans/FREENET_NETWORK_PACK.md — the hosted web bundle hides
 * Freenet because it has no node, not because a build flag was left out.
 *
 * Distinct from `detectFreenetRuntime()`, which answers a different question —
 * "is there a node anywhere this device can *reach*" — and still drives the
 * tablet reader path through a paired hub or a sideloaded node.
 *
 * Pure apart from the two shell probes; safe to call while rendering.
 */

import { isDesktopShell } from './desktopBridge.ts';
import { isNativePlatform } from './freenetRuntime.ts';

export type FreenetHostCapability =
  /** Electron: `units/puf-freenet-host` behind the preload bridge (`puf-freenet:*`). */
  | 'electron'
  /** Capacitor `FreenetHost` plugin → `:freenet` process. Phase 3; not built yet. */
  | 'android'
  /** Hosted web, or an APK before Phase 3 — nothing here can run a node. */
  | null;

export function freenetHostCapabilityFor(input: {
  desktop: boolean;
  native: boolean;
  /** Set by the Capacitor `FreenetHost` plugin once Phase 3 lands. Always false today. */
  androidHost?: boolean;
}): FreenetHostCapability {
  if (input.desktop) return 'electron';
  if (input.native && input.androidHost) return 'android';
  return null;
}

export function getFreenetHostCapability(): FreenetHostCapability {
  return freenetHostCapabilityFor({ desktop: isDesktopShell(), native: isNativePlatform() });
}
