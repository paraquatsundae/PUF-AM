/**
 * Crew InviteToken over Freenet — slot address comes from the token, not FarmSeed.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 */

import {
  decodeJoinSlotState,
  encodeJoinSlotState,
  joinSlotSequence,
} from '../../units/mist-freenet/src/freenet02-slot.ts';
import {
  CrewJoinError,
  deriveCrewJoinSigningSeed,
  deriveCrewJoinSlotAddress,
  unwrapCrewJoinEnvelope,
  wrapCrewJoinEnvelope,
  type CrewJoinEnvelope,
} from '../../units/mist-freenet/src/crew-join.ts';
import { normalizeInviteToken } from '../../units/mist-freenet/src/invite-token.ts';
import { getFreenetPackTransport } from './freenetTransportSelect.ts';
import {
  JoinSlotMismatchError,
  JoinSlotUnavailableError,
  readJoinSlotState,
  type PublishJoinSlotResult,
} from './joinSlotFreenet.ts';
import { FreenetTransportError } from './freenetPackTransport.ts';

function unavailable(error: unknown, fallback: string): JoinSlotUnavailableError {
  if (error instanceof JoinSlotUnavailableError) return error;
  if (error instanceof FreenetTransportError) return new JoinSlotUnavailableError(error.message);
  return new JoinSlotUnavailableError(error instanceof Error && error.message ? error.message : fallback);
}

export async function publishCrewInviteToFreenetSlot(
  envelope: CrewJoinEnvelope,
): Promise<PublishJoinSlotResult> {
  const token = normalizeInviteToken(envelope.ticket);
  if (!token) {
    throw new CrewJoinError(
      'That short ticket cannot open the farm. Ask the owner for a crew invite (PUF- and 26 letters).',
    );
  }

  const address = await deriveCrewJoinSlotAddress(token);
  const signingSeed = await deriveCrewJoinSigningSeed(token);
  const payload = await wrapCrewJoinEnvelope(envelope, token);
  const state = encodeJoinSlotState({
    slotId: address.slotId,
    signingSeed,
    seq: joinSlotSequence(),
    payload,
  });

  try {
    return await getFreenetPackTransport().slotPublish({
      parameters: address.parameters,
      state,
      instanceIdBase58: address.instanceIdBase58,
    });
  } catch (error) {
    throw unavailable(error, 'the Freenet crew-invite slot publish failed');
  }
}

export type ResolvedCrewInviteSlot = {
  envelope: CrewJoinEnvelope;
  instanceIdBase58: string;
};

export async function resolveCrewInviteFromFreenetSlot(
  invite: string,
  options?: { signal?: AbortSignal },
): Promise<ResolvedCrewInviteSlot> {
  const token = normalizeInviteToken(invite);
  if (!token) {
    throw new JoinSlotMismatchError(
      'That short ticket cannot open the farm. Ask the owner for a crew invite (PUF- and 26 letters).',
    );
  }

  const address = await deriveCrewJoinSlotAddress(token);
  const state = await readJoinSlotState(address.instanceIdBase58, options?.signal);

  let payload: Uint8Array;
  try {
    ({ payload } = decodeJoinSlotState(state, {
      slotId: address.slotId,
      verifyingKey: address.verifyingKey,
    }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    throw new JoinSlotMismatchError(`The Freenet crew invite is not signed for this token (${reason}).`);
  }

  let envelope: CrewJoinEnvelope;
  try {
    envelope = await unwrapCrewJoinEnvelope(payload, token);
  } catch (error) {
    throw new JoinSlotMismatchError(
      error instanceof Error ? error.message : 'The Freenet crew invite could not be opened.',
    );
  }

  if (envelope.expires && Date.parse(envelope.expires) <= Date.now()) {
    throw new JoinSlotMismatchError(
      'That crew invite has expired. Ask the farm owner to send the farm again for a fresh one.',
    );
  }

  return { envelope, instanceIdBase58: address.instanceIdBase58 };
}
