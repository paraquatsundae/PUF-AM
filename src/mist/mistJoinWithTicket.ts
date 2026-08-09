/**
 * The whole joiner action, in one call: ticket → manifest → Freenet pull → farm.
 *
 * Shared by the blocking join gate (first run on laptop B) and the Settings sync
 * card (retry, or joining again after the owner re-sent), so the two surfaces
 * cannot drift on what "joined" means.
 */

import { fetchAndRehydrateFarmFromAddresses, refreshFarmUiAfterRecovery } from './mistDisasterRecovery.ts';
import { markMistJoinTicketAccepted } from './mistDeviceSession.ts';
import { readJoinGrant, type JoinGrant } from '../../shared/sync/joinGrant.ts';
import { resolveJoinTicket, type JoinManifestV2, type JoinTicketResolver } from './joinTicketResolver.ts';

export type JoinFarmWithTicketResult = {
  manifest: JoinManifestV2;
  /** What the ticket granted — preset, role and the modules now in the nav. */
  grant: JoinGrant;
  /** Which resolver answered — surfaced in diagnostics, not in the operator sentence. */
  resolvedBy: string;
  diary: number;
  blocks: number;
};

export async function joinFarmWithShortTicket(input: {
  farmId: string;
  ticket: string;
  /** `192.168.1.20:3000` when mDNS cannot see the owner's hub. */
  ownerBase?: string;
  devicePin?: string;
  resolvers?: JoinTicketResolver[];
}): Promise<JoinFarmWithTicketResult> {
  // The PIN goes to the *lookup* as well as the fetch. A Freenet slot address is
  // derived from the FarmSeed the PIN unlocks, so dropping it here — which this
  // did — left `FreenetSlotJoinTicketResolver` unable to answer on any
  // PIN-locked device, and a device is PIN-locked in the normal case after
  // FarmCode recovery. The LAN resolver has no use for it and ignores it.
  const { manifest, resolvedBy } = await resolveJoinTicket(input.ticket, input.farmId, {
    ...(input.ownerBase ? { ownerBase: input.ownerBase } : {}),
    ...(input.devicePin ? { devicePin: input.devicePin } : {}),
    ...(input.resolvers ? { resolvers: input.resolvers } : {}),
  });

  const result = await fetchAndRehydrateFarmFromAddresses(input.farmId, manifest, input.devicePin);
  await refreshFarmUiAfterRecovery(input.farmId);

  // Only now is the device actually a member, and what it is comes off the
  // manifest rather than the role it guessed at recovery time. A ticket minted
  // before presets carries no `permissions`, so its role's defaults stand in.
  const grant = readJoinGrant(manifest);
  markMistJoinTicketAccepted(grant);

  return {
    manifest,
    grant,
    resolvedBy,
    diary: result.hot.after.diary,
    blocks: result.geometry.after.blocks,
  };
}
