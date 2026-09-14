/**
 * Bring up this shell's Freenet node before join / Send — AppImage or APK.
 *
 * Plans/FREENET_NETWORK_PACK.md Decision 2026-09-12 (in-app node) and 2026-09-13
 * (AppImage parity): no second Freenet app, no `MIST_FREENET=1`, no LAN hub.
 * Attach-if-port-taken if something already answers on :7509; never kill it.
 */

import { getDesktopBridge } from '../lib/desktopBridge.ts';
import { isFreenetHostPluginAvailable } from '../lib/androidFreenetHost.ts';
import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import { ensureAndroidFreenetListening } from './freenetAndroidHost.ts';

export function hostModeIsUp(status: FreenetHostStatus | null | undefined): boolean {
  return status?.mode === 'managed' || status?.mode === 'attached' || status?.mode === 'starting';
}

export type DesktopFreenetHostDeps = {
  getBridge?: typeof getDesktopBridge;
};

/**
 * Persist the desktop mist opt-in and start the bundled node (or attach).
 * `setPreference(true)` already calls `start()` in main.
 */
export async function ensureDesktopFreenetListening(
  deps: DesktopFreenetHostDeps = {},
): Promise<FreenetHostStatus | null> {
  const bridge = (deps.getBridge ?? getDesktopBridge)();
  if (!bridge?.freenet) return null;

  try {
    if (bridge.mist) {
      const pref = await bridge.mist.getPreference();
      if (!pref.enabled) {
        const next = await bridge.mist.setPreference(true);
        if (hostModeIsUp(next.host)) return next.host;
      }
    }
    const status = await bridge.freenet.status();
    if (hostModeIsUp(status)) return status;
    return await bridge.freenet.start();
  } catch {
    return null;
  }
}

/** Desktop bundled node, else in-APK `:freenet`. No-op on hosted web. */
export async function ensureFreenetHostListening(
  deps: DesktopFreenetHostDeps = {},
): Promise<void> {
  const bridge = (deps.getBridge ?? getDesktopBridge)();
  if (bridge?.freenet) {
    await ensureDesktopFreenetListening(deps);
    return;
  }
  if (isFreenetHostPluginAvailable()) {
    await ensureAndroidFreenetListening();
  }
}
