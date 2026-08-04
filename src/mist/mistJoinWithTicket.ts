/**
 * The whole joiner action, in one call: ticket → manifest → Freenet pull → farm.
 *
 * Shared by the blocking join gate (first run on laptop B) and the Settings sync
 * card (retry, or joining again after the owner re-sent), so the two surfaces
 * cannot drift on what "joined" means.
 */

import { fetchAndRehydrateFarmFromAddresses, refreshFarmUiAfterRecovery } from './mistDisasterRecovery.ts';
import { markMistJoinTicketAccepted } from './mistDeviceSession.ts';
import { resolveJoinTicket, type JoinManifestV2, type JoinTicketResolver } from './joinTicketResolver.ts';

export type JoinFarmWithTicketResult = {
  manifest: JoinManifestV2;
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
  const { manifest, resolvedBy } = await resolveJoinTicket(input.ticket, input.farmId, {
    ...(input.ownerBase ? { ownerBase: input.ownerBase } : {}),
    ...(input.resolvers ? { resolvers: input.resolvers } : {}),
  });

  const result = await fetchAndRehydrateFarmFromAddresses(input.farmId, manifest, input.devicePin);
  await refreshFarmUiAfterRecovery(input.farmId);

  // Only now is the device actually a member: the role it was granted is the one
  // the manifest carried, not the one it guessed at recovery time.
  markMistJoinTicketAccepted(manifest.role);

  return {
    manifest,
    resolvedBy,
    diary: result.hot.after.diary,
    blocks: result.geometry.after.blocks,
  };
}
