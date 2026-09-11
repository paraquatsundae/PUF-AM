/**
 * The network pack's one hook: enabled-for-this-farm + host capability →
 * reconcile the device's node (Plans/NETWORK_PACK_PLUGIN.md § Enable semantics).
 *
 * Mounted once per signed-in session from the pack's `farmSession` surface —
 * never from `AuthContext`, which does not import pack code. Debounced so that
 * switching between two Freenet farms (want stays true) never restarts the
 * node, and a quick off/on does not race stop against start.
 *
 * `want` itself is `computeFreenetHostWant` — the hybrid inputs (farm-doc flag,
 * seed on this device) are what slice C added; see that file for the table.
 */

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../src/contexts/AuthContext';
import { getDesktopBridge } from '../../../src/lib/desktopBridge.ts';
import { activeFarmPipe, isCloudMirror, mirroredCloudFarmId } from '../../../src/lib/farmPipes';
import {
  freenetHostCapabilityCanRun,
  getFreenetHostCapability,
} from '../../../src/lib/freenetHostCapability.ts';
import { getAndroidFreenetBridge } from '../../../src/mist/freenetAndroidHost.ts';
import { subscribeLocalFreenetNode } from '../../../src/mist/freenetLocalNode.ts';
import { getFreenetPackTransport } from '../../../src/mist/freenetTransportSelect.ts';
import { isFreenetHostEnabled, subscribeFreenetHostEnabled } from './freenetHostEnable.ts';
import { createFreenetHostReconciler, type FreenetHostReconciler } from './freenetHostReconcile.ts';
import { subscribeFreenetHybridDevice } from './freenetHostCloud.ts';
import { computeFreenetHostWant } from './freenetHostWant.ts';

export const FREENET_HOST_RECONCILE_DEBOUNCE_MS = 1500;

/**
 * Node through the bridge, peer through the pack transport. On Electron the
 * transport is the host one (slice B), so the peer step is the host's own wire
 * rather than a `POST /api/mist/freenet/peer/start` to the loopback Express.
 */
function hostHandle() {
  const capability = getFreenetHostCapability();
  if (capability === 'electron') return getDesktopBridge()?.freenet ?? null;
  if (capability === 'android') return getAndroidFreenetBridge();
  return null;
}

function shellReconciler(): FreenetHostReconciler | null {
  const host = hostHandle();
  if (!host) return null;
  const transport = getFreenetPackTransport();
  return createFreenetHostReconciler({
    host,
    peer: {
      start: () => transport.peerStart({ contribute: false }),
      stop: () => transport.peerStop(),
    },
    onError: (stage, error) => console.warn(`[freenet_host] ${stage}:`, error),
  });
}

export function useFreenetHostReconciler(): { want: boolean } {
  const { userData, farmNetworkPacks } = useAuth();
  const farmId = userData?.farmId ?? null;
  const [enabledTick, setEnabledTick] = useState(0);
  useEffect(() => subscribeFreenetHostEnabled(() => setEnabledTick((n) => n + 1)), []);
  // A hybrid enable seals a seed on this device after the session started; the
  // farm-doc flag alone is not enough to want a node until that seed is here.
  useEffect(() => subscribeFreenetHybridDevice(() => setEnabledTick((n) => n + 1)), []);
  // Attach-if-port-taken: a Freenet Android Node coming up flips capability.
  useEffect(() => subscribeLocalFreenetNode(() => setEnabledTick((n) => n + 1)), []);

  const capability = getFreenetHostCapability();
  // enabledTick is the store subscription; it re-reads the flag after a toggle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const want = useMemo(
    () =>
      computeFreenetHostWant({
        farmId,
        pipe: activeFarmPipe(farmId),
        cloudMirror: isCloudMirror(),
        localEnabled: isFreenetHostEnabled(farmId),
        farmNetworkPacks,
        seedCloudFarmId: mirroredCloudFarmId(),
        capability,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farmId, farmNetworkPacks, capability, enabledTick],
  );

  const reconciler = useMemo(
    () => (freenetHostCapabilityCanRun(capability) ? shellReconciler() : null),
    [capability],
  );

  useEffect(() => {
    if (!reconciler) return;
    const timer = setTimeout(() => {
      void reconciler.reconcile(want);
    }, FREENET_HOST_RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [reconciler, want]);

  return { want };
}
