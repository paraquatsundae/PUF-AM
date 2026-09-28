/**
 * Admin remint of a crew invite for a person who cannot unlock locally.
 *
 * Sign out clears the mist session. Without a device PIN there is nothing left
 * to open, and the old InviteToken may be expired or unread. This mints a new
 * one for that label/role. Reuses last published Hot + bones URIs when this
 * device already Sent — no second farm PUT. Never wraps FarmSeed.
 *
 * @see Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-19
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §4a
 */

import { withFreenetFarmPublishLock } from './freenetPublishLock.ts';
import { issueCrewInvite, type IssueCrewInviteResult } from './issueCrewInvite.ts';
import { lastPublishedFreenetHandoff } from './mistHotPublishMeta.ts';
import { resolveMistFarmSeed } from './mistHotBridge.ts';
import { publishFarmToFreenet, type HybridPublishSource } from './mistFreenetClient.ts';
import type { JoinPreset } from '../../shared/sync/joinGrant.ts';
import type { JoinRole } from '../../shared/sync/joinTicket.ts';

export type IssueCrewRecoveryInviteInput = {
  farmId: string;
  label: string;
  preset?: JoinPreset;
  role?: JoinRole;
  devicePin?: string;
  hybrid?: HybridPublishSource;
};

export async function issueCrewRecoveryInvite(
  input: IssueCrewRecoveryInviteInput,
): Promise<IssueCrewInviteResult> {
  const label = input.label.trim();
  if (!label) {
    throw new Error('Name who this recovery code is for — it stays on this hub’s People list.');
  }

  const handoff = lastPublishedFreenetHandoff(input.farmId);
  if (!handoff) {
    const published = await publishFarmToFreenet(input.farmId, {
      ...(input.preset ? { preset: input.preset } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.devicePin ? { devicePin: input.devicePin } : {}),
      label,
      ...(input.hybrid ? { hybrid: input.hybrid } : {}),
    });
    return published;
  }

  return withFreenetFarmPublishLock(async () => {
    const farmSeed = await resolveMistFarmSeed(input.devicePin);
    if (!farmSeed) {
      throw new Error(
        'Unlock this device before issuing a recovery code — the invite wraps this farm’s read keys.',
      );
    }
    return issueCrewInvite({
      farmId: input.farmId,
      farmSeed,
      hotUri: handoff.hotUri,
      bonesUri: handoff.bonesUri,
      ...(handoff.hotContentHash ? { hotContentHash: handoff.hotContentHash } : {}),
      ...(handoff.bonesContentHash ? { bonesContentHash: handoff.bonesContentHash } : {}),
      ...(input.preset ? { preset: input.preset } : {}),
      ...(input.role ? { role: input.role } : {}),
      label,
      ...(input.hybrid ? { hybrid: input.hybrid } : {}),
    });
  });
}
