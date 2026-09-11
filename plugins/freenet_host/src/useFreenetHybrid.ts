/**
 * Which farm the Freenet card is actually about, on a hybrid device.
 *
 * Plans/FREENET_NETWORK_PACK.md §3: a hybrid farm has two ids — the Firestore
 * farm the operator is signed into and the mist FarmId the sealed mirror,
 * tickets and publish status are keyed by. Everything under the Freenet card
 * uses the mist id; the cloud id rides along so Send reads the right local cache
 * and stamps the manifest. `null` means this is not a hybrid device at all.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  activeFarmPipe,
  freenetPlaneFarmId,
  isCloudMirror,
  mirroredCloudFarmId,
} from '../../../src/lib/farmPipes';
import { subscribeFreenetHybridDevice } from './freenetHostCloud.ts';

export type FreenetHybridContext = {
  /** Mist FarmId — what the mirror, tickets and publish status are keyed by. */
  mistFarmId: string;
  /** Firestore farm id — the authority, and the local cache Send reads. */
  cloudFarmId: string;
  /** Joined over Freenet, no Firebase membership: read-only, pull only. */
  mirror: boolean;
};

export function useFreenetHybrid(signedInFarmId: string | null | undefined): FreenetHybridContext | null {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeFreenetHybridDevice(() => setTick((n) => n + 1)), []);

  return useMemo(() => {
    if (activeFarmPipe(signedInFarmId) !== 'hybrid') return null;
    const mistFarmId = freenetPlaneFarmId();
    const cloudFarmId = mirroredCloudFarmId();
    if (!mistFarmId || !cloudFarmId) return null;
    return { mistFarmId, cloudFarmId, mirror: isCloudMirror() };
    // tick re-reads localStorage after a seal in this tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInFarmId, tick]);
}
