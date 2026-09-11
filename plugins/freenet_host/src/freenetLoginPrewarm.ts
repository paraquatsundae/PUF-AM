/**
 * Flip the desktop mist preference on (Electron) and start the node while the
 * joiner types their name. Same reconciler as `farmSession` — core never sees
 * a node. Android attaches to Freenet Android Node on :7509 the same way.
 * `Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.8.
 */

import { getDesktopBridge, type DesktopBridge } from '../../../src/lib/desktopBridge.ts';
import {
  freenetHostCapabilityCanRun,
  getFreenetHostCapability,
  type FreenetHostCapability,
} from '../../../src/lib/freenetHostCapability.ts';
import { getAndroidFreenetBridge } from '../../../src/mist/freenetAndroidHost.ts';
import { getFreenetPackTransport } from '../../../src/mist/freenetTransportSelect.ts';
import type { FreenetHostStatus } from '../../../units/puf-freenet-host/src/types.ts';
import { createFreenetHostReconciler, type FreenetHostReconciler } from './freenetHostReconcile.ts';

export type PrewarmHostHandle = {
  status(): Promise<FreenetHostStatus | null>;
  start(): Promise<FreenetHostStatus | null>;
  stop(): Promise<FreenetHostStatus | null>;
};

export type PrewarmFreenetHostDeps = {
  getCapability?: () => FreenetHostCapability;
  getBridge?: () => DesktopBridge | null;
  getHost?: () => PrewarmHostHandle | null;
  createReconciler?: (host: PrewarmHostHandle) => FreenetHostReconciler | null;
};

function defaultHost(capability: FreenetHostCapability, bridge: DesktopBridge | null): PrewarmHostHandle | null {
  if (capability === 'electron') return bridge?.freenet ?? null;
  if (capability === 'android') return getAndroidFreenetBridge();
  return null;
}

function defaultReconciler(host: PrewarmHostHandle): FreenetHostReconciler {
  const transport = getFreenetPackTransport();
  return createFreenetHostReconciler({
    host,
    peer: {
      start: () => transport.peerStart({ contribute: false }),
      stop: () => transport.peerStop(),
    },
  });
}

export async function prewarmFreenetHost(deps: PrewarmFreenetHostDeps = {}): Promise<void> {
  const capability = (deps.getCapability ?? getFreenetHostCapability)();
  if (!freenetHostCapabilityCanRun(capability)) return;

  const bridge = (deps.getBridge ?? getDesktopBridge)();
  if (capability === 'electron' && bridge?.mist) {
    try {
      const pref = await bridge.mist.getPreference();
      if (!pref.enabled) await bridge.mist.setPreference(true);
    } catch {
      /* Preference is best-effort; the join still proceeds. */
    }
  }

  const host = (deps.getHost ?? (() => defaultHost(capability, bridge)))();
  if (!host) return;

  const reconciler = (deps.createReconciler ?? defaultReconciler)(host);
  if (!reconciler) return;
  await reconciler.reconcile(true);
}
