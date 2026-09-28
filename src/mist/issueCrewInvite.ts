/**
 * Mint a crew InviteToken against already-published Hot + bones URIs.
 *
 * Send publishes the farm then calls this. Recovery remints for a person who
 * signed out without a device PIN — they cannot unlock a local session and
 * must type a fresh invite. Never wraps FarmSeed.
 *
 * @see Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-19
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 */

import {
  bytesToHex,
  deriveBonesContractKey,
  deriveHotContractKey,
  mintInviteToken,
  wrapCrewJoinEnvelope,
  type CrewJoinEnvelope,
} from '../../units/mist-freenet/src/index.ts';
import {
  DEFAULT_JOIN_ROLE,
  defaultJoinTicketExpiry,
  type JoinRole,
} from '../../shared/sync/joinTicket.ts';
import {
  buildJoinPermissions,
  type JoinPreset,
  type JoinPresetId,
} from '../../shared/sync/joinGrant.ts';
import { LanJoinTicketResolver, registerJoinTicketOnLan } from './joinTicketResolver.ts';
import { publishCrewInviteToFreenetSlot } from './crewJoinSlot.ts';
import { buildJoinTicketV1, formatJoinTicket, type MistJoinTicketV1 } from './mistJoinTicket.ts';
import { saveJoinTicketForFarm } from './mistHotPublishMeta.ts';

export type IssueCrewInviteInput = {
  farmId: string;
  farmSeed: Uint8Array;
  hotUri: string;
  bonesUri: string;
  hotContentHash?: string;
  bonesContentHash?: string;
  preset?: JoinPreset;
  role?: JoinRole;
  permissions?: Record<string, boolean | number | string>;
  expires?: string;
  label?: string;
  hybrid?: { cloudFarmId: string };
};

export type IssueCrewInviteResult = {
  joinTicket: MistJoinTicketV1;
  joinTicketText: string;
  shortTicket?: string;
  shortTicketRole: JoinRole;
  shortTicketPreset?: JoinPresetId;
  shortTicketExpires?: string;
  shortTicketError?: string;
  shortTicketOnLan: boolean;
  shortTicketOnFreenet?: 'put' | 'update';
};

export function describeTicketRouteGap(input: {
  lanError?: string;
  freenetError?: string;
}): string | undefined {
  const { lanError, freenetError } = input;
  if (!lanError && !freenetError) return undefined;

  if (lanError && freenetError) {
    return `no route can answer for it — this device's hub said "${lanError}", and Freenet said "${freenetError}"`;
  }
  if (freenetError) {
    return `it works on this Wi‑Fi but not off it — the Freenet slot did not publish: ${freenetError}`;
  }
  return `it works off this Wi‑Fi but may take a few minutes to be findable — this device's hub did not take it: ${lanError}`;
}

export async function issueCrewInvite(input: IssueCrewInviteInput): Promise<IssueCrewInviteResult> {
  const {
    farmId,
    farmSeed,
    hotUri,
    bonesUri,
    hotContentHash,
    bonesContentHash,
    preset,
    hybrid,
  } = input;

  const joinTicket = buildJoinTicketV1({
    hotUri,
    bonesUri,
    hotContentHash,
    bonesContentHash,
  });

  const minted = mintInviteToken();
  const role = preset?.role ?? input.role ?? DEFAULT_JOIN_ROLE;
  const expires = input.expires ?? defaultJoinTicketExpiry();
  const permissions = input.permissions ?? (preset ? buildJoinPermissions(preset) : undefined);
  const hotKeyBytes = await deriveHotContractKey(farmSeed);
  const bonesKeyBytes = await deriveBonesContractKey(farmSeed);

  const envelope: CrewJoinEnvelope = {
    v: 3,
    kind: 'crew-join',
    farmId,
    hotUri,
    bonesUri,
    hotKeyHex: bytesToHex(hotKeyBytes),
    bonesKeyHex: bytesToHex(bonesKeyBytes),
    role,
    ticket: minted,
    ...(permissions ? { permissions } : {}),
    expires,
    ...(hotContentHash ? { hotContentHash } : {}),
    ...(bonesContentHash ? { bonesContentHash } : {}),
    ...(hybrid ? { cloudFarmId: hybrid.cloudFarmId } : {}),
  };
  const sealedCrew = bytesToHex(await wrapCrewJoinEnvelope(envelope, minted));

  const manifestFields = {
    ticket: minted,
    farmId,
    hotUri,
    bonesUri,
    role,
    ...(permissions ? { permissions } : {}),
    expires,
    ...(hotContentHash ? { hotContentHash } : {}),
    ...(bonesContentHash ? { bonesContentHash } : {}),
    ...(hybrid ? { cloudFarmId: hybrid.cloudFarmId } : {}),
  };

  let shortTicketOnLan = false;
  let lanError: string | undefined;
  try {
    await registerJoinTicketOnLan({
      ...manifestFields,
      sealedCrew,
      ...(input.label ? { label: input.label } : {}),
    });
    await new LanJoinTicketResolver().resolve(minted, farmId);
    shortTicketOnLan = true;
  } catch (error) {
    lanError = error instanceof Error ? error.message : 'the hub did not accept it';
  }

  let shortTicketOnFreenet: 'put' | 'update' | undefined;
  let freenetError: string | undefined;
  try {
    const slot = await publishCrewInviteToFreenetSlot(envelope);
    shortTicketOnFreenet = slot.mode;
  } catch (error) {
    freenetError =
      error instanceof Error ? error.message : 'the Freenet crew-invite slot publish failed';
  }

  const shortTicket = shortTicketOnLan || shortTicketOnFreenet ? minted : undefined;
  if (shortTicket) {
    saveJoinTicketForFarm(farmId, {
      ticket: minted,
      role,
      ...(preset ? { preset: preset.id } : {}),
      expires,
    });
  }

  const shortTicketError = describeTicketRouteGap({ lanError, freenetError });

  return {
    joinTicket,
    joinTicketText: formatJoinTicket(joinTicket),
    ...(shortTicket ? { shortTicket } : {}),
    shortTicketRole: role,
    ...(preset ? { shortTicketPreset: preset.id } : {}),
    shortTicketExpires: expires,
    shortTicketOnLan,
    ...(shortTicketOnFreenet ? { shortTicketOnFreenet } : {}),
    ...(shortTicketError ? { shortTicketError } : {}),
  };
}
