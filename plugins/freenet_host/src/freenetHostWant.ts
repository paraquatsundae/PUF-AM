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
 * Capability is the outer gate: only Electron can run a node in Phase 1.
 */

import type { FarmNetworkPacksMap } from '../../../shared/farm/networkPacks';
import { isFarmFreenetHostEnabled } from '../../../shared/farm/networkPacks';
import type { FarmPipe } from '../../../src/lib/farmPipes';
import type { FreenetHostCapability } from '../../../src/lib/freenetHostCapability.ts';

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
};

export function computeFreenetHostWant(input: FreenetHostWantInput): boolean {
  if (!input.farmId || input.capability !== 'electron') return false;
  if (input.pipe === 'freenet') return input.localEnabled;
  if (input.pipe === 'hybrid') {
    if (input.cloudMirror) return input.localEnabled;
    return (
      isFarmFreenetHostEnabled(input.farmNetworkPacks) && input.seedCloudFarmId === input.farmId
    );
  }
  return false;
}
