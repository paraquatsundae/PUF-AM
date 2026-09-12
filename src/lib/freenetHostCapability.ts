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
 * On Capacitor, `'android'` means a node is answering on `127.0.0.1:7509`
 * (Freenet Android Node — attach-if-port-taken, Phase 3 product path). The
 * Capacitor `FreenetHost` plugin is how we attach or start our own process; it
 * is registered on every APK and must not count as a live host. Treating the
 * plugin as capability `'android'` selected the host transport while :7509 was
 * down, which skipped the hub relay and implied Send.
 *
 * Pure apart from the shell probes; safe to call while rendering.
 */

import { isDesktopShell } from './desktopBridge.ts';
import { isNativePlatform } from './freenetRuntime.ts';
import { localFreenetNodeFound } from '../mist/freenetLocalNode.ts';

export type FreenetHostCapability =
  /** Electron: `units/puf-freenet-host` behind the preload bridge (`puf-freenet:*`). */
  | 'electron'
  /** Capacitor: a loopback node on :7509 has answered. */
  | 'android'
  /** Hosted web, or an APK whose last :7509 probe missed. */
  | null;

export function freenetHostCapabilityFor(input: {
  desktop: boolean;
  native: boolean;
  /**
   * A node already on this device's loopback (`localFreenetNodeFound()` after
   * a probe). Not "the Capacitor plugin is registered".
   */
  androidHost?: boolean;
}): FreenetHostCapability {
  if (input.desktop) return 'electron';
  if (input.native && input.androidHost) return 'android';
  return null;
}

/** Last :7509 probe said a node is here. Plugin registration does not count. */
export function isAndroidFreenetHostPresent(): boolean {
  if (!isNativePlatform()) return false;
  return localFreenetNodeFound();
}

export function getFreenetHostCapability(): FreenetHostCapability {
  return freenetHostCapabilityFor({
    desktop: isDesktopShell(),
    native: isNativePlatform(),
    androidHost: isAndroidFreenetHostPresent(),
  });
}

/** Electron and Android both own a host adapter and may start a node. */
export function freenetHostCapabilityCanRun(capability: FreenetHostCapability): boolean {
  return capability === 'electron' || capability === 'android';
}
