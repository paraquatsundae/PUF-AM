/**
 * Should this device's Freenet node be up for the farm that is open?
 *
 * One pure function so the answer has a test for every shape of farm
 * (Plans/NETWORK_PACK_PLUGIN.md § Enable semantics, Plans/FREENET_NETWORK_PACK.md §3):
 *
 * - **Freenet-native farm** — the local per-farm flag, default on.
 * - **Mirror device** — joined a hybrid farm over Freenet; same local flag, since
 *   the mirror is the only copy this device has and the node is how it refreshes.
 * - **Hybrid member** — signed into the cloud farm: the farm doc says the mirror
 *   is on *and* this device holds the seed for that farm. Without the seed there
 *   is nothing here for a node to serve, and a seed for a different cloud farm
 *   does not count.
 * - **Plain cloud farm** — never.
 *
 * Capability `'android'` still requires a live `:7509` (transport / Send).
 * Starting our own in-APK node uses `canStartOwnNode` so the chicken-and-egg
 * (capability needs :7509, :7509 needs a start) does not block bring-up.
 */

import type { FarmNetworkPacksMap } from '../../../shared/farm/networkPacks';
import { isFarmFreenetHostEnabled } from '../../../shared/farm/networkPacks';
import type { FarmPipe } from '../../../src/lib/farmPipes';
import {
  freenetHostCapabilityCanRun,
  type FreenetHostCapability,
} from '../../../src/lib/freenetHostCapability.ts';

export type FreenetHostWantInput = {
  /** The farm the app is signed into — cloud id on a member device, mist id otherwise. */
  farmId: string | null;
  pipe: FarmPipe;
  /** `pipe === 'hybrid'` on a device that joined over Freenet, no Firebase membership. */
  cloudMirror: boolean;
  /** Local per-farm flag (`freenetHostEnable.ts`) for the open farm id. */
  localEnabled: boolean;
  /** Farm-doc `networkPacks` for the open cloud farm; empty when not a cloud farm. */
  farmNetworkPacks: FarmNetworkPacksMap | null | undefined;
  /** The cloud farm id this device's sealed seed belongs to, or `null`. */
  seedCloudFarmId: string | null;
  capability: FreenetHostCapability;
  /**
   * Android: the Capacitor plugin is registered, so this device can attach or
   * spawn even before `'android'` capability (live :7509) is true.
   */
  canStartOwnNode?: boolean;
  /**
   * A sealed mist session is on this device. The farm-store backend flag can
   * still say firebase (session looks like workshop/cloud) — still start.
   */
  hasMistSession?: boolean;
  /**
   * Settings kill switch: operator paused the node. Reconciler must not
   * respawn until Start or the next farm open.
   */
  operatorHoldOff?: boolean;
};

export function computeFreenetHostWant(input: FreenetHostWantInput): boolean {
  if (input.operatorHoldOff) return false;
  if (!input.farmId) return false;
  if (!freenetHostCapabilityCanRun(input.capability) && !input.canStartOwnNode) return false;
  if (input.pipe === 'freenet') return input.localEnabled;
  if (input.pipe === 'hybrid') {
    if (input.cloudMirror) return input.localEnabled;
    return (
      isFarmFreenetHostEnabled(input.farmNetworkPacks) && input.seedCloudFarmId === input.farmId
    );
  }
  // Backend still `firebase` but this device holds a Freenet-native seed.
  if (input.hasMistSession && !input.seedCloudFarmId) return input.localEnabled;
  return false;
}
