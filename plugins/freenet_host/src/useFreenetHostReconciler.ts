/**
 * The network pack's one hook: enabled-for-this-farm + host capability →
 * reconcile the device's node (Plans/NETWORK_PACK_PLUGIN.md § Enable semantics).
 *
 * Mounted once per signed-in session from the pack's `farmSession` surface —
 * never from `AuthContext`, which does not import pack code. Debounced so that
 * switching between two Freenet farms (want stays true) never restarts the
 * node, and a quick off/on does not race stop against start.
 */

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../src/contexts/AuthContext';
import { getDesktopBridge } from '../../../src/lib/desktopBridge.ts';
import { isFreenetFarm } from '../../../src/lib/farmPipes';
import { getFreenetHostCapability } from '../../../src/lib/freenetHostCapability.ts';
import { startFreenetPeer, stopFreenetPeer } from '../../../src/mist/mistFreenetClient.ts';
import { isFreenetHostEnabled, subscribeFreenetHostEnabled } from './freenetHostEnable.ts';
import { createFreenetHostReconciler, type FreenetHostReconciler } from './freenetHostReconcile.ts';

export const FREENET_HOST_RECONCILE_DEBOUNCE_MS = 1500;

function electronReconciler(): FreenetHostReconciler | null {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  return createFreenetHostReconciler({
    host: bridge.freenet,
    peer: { start: () => startFreenetPeer({ contribute: false }), stop: stopFreenetPeer },
    onError: (stage, error) => console.warn(`[freenet_host] ${stage}:`, error),
  });
}

export function useFreenetHostReconciler(): { want: boolean } {
  const { userData } = useAuth();
  const farmId = userData?.farmId ?? null;
  const [enabledTick, setEnabledTick] = useState(0);
  useEffect(() => subscribeFreenetHostEnabled(() => setEnabledTick((n) => n + 1)), []);

  const capability = getFreenetHostCapability();
  // enabledTick is the store subscription; it re-reads the flag after a toggle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const enabled = useMemo(() => isFreenetHostEnabled(farmId), [farmId, enabledTick]);
  const want = Boolean(farmId) && isFreenetFarm() && enabled && capability === 'electron';

  const reconciler = useMemo(() => (capability === 'electron' ? electronReconciler() : null), [capability]);

  useEffect(() => {
    if (!reconciler) return;
    const timer = setTimeout(() => {
      void reconciler.reconcile(want);
    }, FREENET_HOST_RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [reconciler, want]);

  return { want };
}
