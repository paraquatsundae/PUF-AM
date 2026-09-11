/**
 * Flip the desktop mist preference on and start the node while the joiner
 * types their name. Same reconciler as `farmSession` — core never sees a node.
 * `Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.8.
 */

import { getDesktopBridge, type DesktopBridge } from '../../../src/lib/desktopBridge.ts';
import { getFreenetHostCapability, type FreenetHostCapability } from '../../../src/lib/freenetHostCapability.ts';
import { getFreenetPackTransport } from '../../../src/mist/freenetTransportSelect.ts';
import { createFreenetHostReconciler, type FreenetHostReconciler } from './freenetHostReconcile.ts';

export type PrewarmFreenetHostDeps = {
  getCapability?: () => FreenetHostCapability;
  getBridge?: () => DesktopBridge | null;
  createReconciler?: (bridge: DesktopBridge) => FreenetHostReconciler | null;
};

function defaultReconciler(bridge: DesktopBridge): FreenetHostReconciler {
  const transport = getFreenetPackTransport();
  return createFreenetHostReconciler({
    host: bridge.freenet,
    peer: {
      start: () => transport.peerStart({ contribute: false }),
      stop: () => transport.peerStop(),
    },
  });
}

export async function prewarmFreenetHost(deps: PrewarmFreenetHostDeps = {}): Promise<void> {
  const capability = (deps.getCapability ?? getFreenetHostCapability)();
  if (capability !== 'electron') return;

  const bridge = (deps.getBridge ?? getDesktopBridge)();
  if (!bridge) return;

  if (bridge.mist) {
    try {
      const pref = await bridge.mist.getPreference();
      if (!pref.enabled) await bridge.mist.setPreference(true);
    } catch {
      /* Preference is best-effort; the join still proceeds. */
    }
  }

  const reconciler = (deps.createReconciler ?? defaultReconciler)(bridge);
  if (!reconciler) return;
  await reconciler.reconcile(true);
}
