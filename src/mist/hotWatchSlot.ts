/**
 * Publish / read the farm Hot watch slot (generation + current Hot URI).
 *
 * @see Plans/FREENET_OPERATOR_FLOW.md §9.2 Decision 2026-09-12 (auto watch)
 */

import {
  decodeJoinSlotState,
  encodeJoinSlotState,
  joinSlotSequence,
} from '../../units/mist-freenet/src/freenet02-slot.ts';
import {
  deriveHotWatchSigningSeed,
  deriveHotWatchSlotAddress,
  unwrapHotWatchPing,
  wrapHotWatchPing,
  type HotWatchPing,
} from '../../units/mist-freenet/src/hot-watch.ts';
import { FreenetTransportError } from './freenetPackTransport.ts';
import { getFreenetPackTransport } from './freenetTransportSelect.ts';
import {
  JoinSlotMismatchError,
  JoinSlotUnavailableError,
  readJoinSlotState,
  type PublishJoinSlotResult,
} from './joinSlotFreenet.ts';

function unavailable(error: unknown, fallback: string): JoinSlotUnavailableError {
  if (error instanceof JoinSlotUnavailableError) return error;
  if (error instanceof FreenetTransportError) return new JoinSlotUnavailableError(error.message);
  return new JoinSlotUnavailableError(error instanceof Error && error.message ? error.message : fallback);
}

export async function publishHotWatchSlot(
  ping: HotWatchPing,
  hotKey: Uint8Array,
): Promise<PublishJoinSlotResult> {
  const address = await deriveHotWatchSlotAddress(hotKey);
  const signingSeed = await deriveHotWatchSigningSeed(hotKey);
  const payload = await wrapHotWatchPing(ping, hotKey);
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
    throw unavailable(error, 'the Freenet Hot watch slot publish failed');
  }
}

export async function readHotWatchSlot(
  farmId: string,
  hotKey: Uint8Array,
  options?: { signal?: AbortSignal },
): Promise<HotWatchPing> {
  const address = await deriveHotWatchSlotAddress(hotKey);
  const state = await readJoinSlotState(address.instanceIdBase58, options?.signal);

  let payload: Uint8Array;
  try {
    ({ payload } = decodeJoinSlotState(state, {
      slotId: address.slotId,
      verifyingKey: address.verifyingKey,
    }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    throw new JoinSlotMismatchError(`The Freenet Hot watch slot is not signed for this farm (${reason}).`);
  }

  const ping = await unwrapHotWatchPing(payload, hotKey);
  if (ping.farmId !== farmId) {
    throw new JoinSlotMismatchError(
      `The Freenet Hot watch slot is for a different farm (expected ${farmId}).`,
    );
  }
  return ping;
}
