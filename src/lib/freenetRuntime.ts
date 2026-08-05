/**
 * Where the Freenet node this device talks to actually lives.
 *
 * The mist UI ships in three shells and only two of them can reach a node. The
 * Electron desktop owns a bundled `freenet` child process; a browser talks to an
 * Express that has one. A Capacitor APK has neither: Freenet 0.2 is a native
 * Rust binary, Android will not let PUF-AM spawn one, and there is no WASM peer
 * to link in. The failure is therefore structural, not a misconfiguration, and
 * the tablet UI has to say so rather than offer a Connect button that can only
 * time out.
 *
 * Plan: `Plans/APK_FREENET_PLUGIN.md`.
 */

import { Capacitor } from '@capacitor/core';

import { isDesktopShell } from './desktopBridge.ts';

export type FreenetRuntime =
  /** Electron shell — the app owns a bundled node (`units/puf-freenet-host`). */
  | 'desktop-host'
  /** Browser — same-origin Express, or the workshop `127.0.0.1:3000` sidecar. */
  | 'browser-sidecar'
  /**
   * Capacitor APK pointed at a named hub (`VITE_MIST_FREENET_API`). The node is
   * on that other machine; this device is only an HTTP client of it.
   */
  | 'android-hub'
  /** Capacitor APK with no hub — nothing here can host or reach a node. */
  | 'android-no-host';

export function freenetRuntimeFor(input: {
  desktop: boolean;
  native: boolean;
  /** A Freenet API base was baked into this build or chosen at runtime. */
  hubConfigured: boolean;
}): FreenetRuntime {
  if (input.desktop) return 'desktop-host';
  if (!input.native) return 'browser-sidecar';
  return input.hubConfigured ? 'android-hub' : 'android-no-host';
}

/** True when a Connect button has something on the other end. */
export function canReachFreenetNode(runtime: FreenetRuntime): boolean {
  return runtime !== 'android-no-host';
}

export function detectFreenetRuntime(): FreenetRuntime {
  let native = false;
  try {
    native = Capacitor.isNativePlatform();
  } catch {
    /* Capacitor is absent in tests and plain web builds. */
  }
  return freenetRuntimeFor({
    desktop: isDesktopShell(),
    native,
    hubConfigured: Boolean(String(import.meta.env.VITE_MIST_FREENET_API || '').trim()),
  });
}

/** One sentence for the readiness line, in the operator's words. */
export const FREENET_NO_HOST_LABEL =
  'Freenet does not run on this tablet — the farm is held here, but sending and joining need a PUF-AM laptop.';

/** The follow-up an operator needs once they have read the label. */
export const FREENET_NO_HOST_DETAIL =
  'Freenet 0.2 is a native binary PUF-AM cannot start on Android, so this build has no node of its own. Create or hold a mist farm here as usual; to move it between machines, publish from a PUF-AM desktop and bring the farm across with a FarmCode and join ticket. A shed hub that lends Freenet to tablets over the LAN is planned — see Plans/APK_FREENET_PLUGIN.md.';
