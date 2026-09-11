/**
 * What a successful join means for the device that just did it.
 *
 * Plans/FREENET_NETWORK_PACK.md §3: the same ticket flow lands two very
 * different places. A Freenet-native farm makes this device a **member** at the
 * role the ticket granted. A hybrid farm's ticket lands a **mirror** — the farm
 * is a Firestore farm, this device has no membership in it, and what arrived is
 * read-only. The manifest's `cloudFarmId` says which; the sealed Hot's
 * `meta.cloud_farm_id` is the belt to that brace, for a ticket minted by a
 * device that predates the field.
 *
 * Pure, so the gate's branching has a test without a Freenet node.
 */

import type { JoinManifestV2 } from '../../../shared/sync/joinTicket.ts';

export type JoinOutcome =
  | { kind: 'member' }
  | { kind: 'mirror'; cloudFarmId: string };

export function describeJoinOutcome(input: {
  manifest: Pick<JoinManifestV2, 'cloudFarmId'>;
  /** From the rehydrated Hot blob, when it carried provenance. */
  hotCloudFarmId?: string | null;
}): JoinOutcome {
  const cloudFarmId = input.manifest.cloudFarmId?.trim() || input.hotCloudFarmId?.trim() || '';
  return cloudFarmId ? { kind: 'mirror', cloudFarmId } : { kind: 'member' };
}

/** The sentence the join gate shows. */
export function joinOutcomeMessage(
  outcome: JoinOutcome,
  counts: { diary: number; blocks: number; joinedAs: string },
): string {
  const diary = `${counts.diary} diary ${counts.diary === 1 ? 'entry' : 'entries'}`;
  const blocks = `${counts.blocks} ${counts.blocks === 1 ? 'block' : 'blocks'}`;
  if (outcome.kind === 'mirror') {
    return (
      `This is a mirror of a cloud farm — ${diary} and ${blocks} are on this device, read-only. ` +
      'To edit, join with an invite PIN.'
    );
  }
  return `Joined as ${counts.joinedAs} — ${diary} and ${blocks} are on this device.`;
}
