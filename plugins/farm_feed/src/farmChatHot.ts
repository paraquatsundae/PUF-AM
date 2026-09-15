/**
 * Farm chat on Freenet Hot — one record, HotKey-sealed with hot/current.
 * No new slot. No JPEGs. Must stay inside the 64 KiB pack budget by itself.
 * Plans/FARM_MESSAGING.md · Plans/FREENET_OPERATOR_FLOW.md §9.2
 */
import { FREENET02_MAX_BLOB_BYTES } from '../../../units/mist-freenet/src/freenet02-pack-id.ts';
import type { HotRecord } from '../../../units/mist-freenet/src/seal-hot.ts';
import {
  farmChatHotWatchPairOk,
  parseFarmChatMessages,
  trimFarmChat,
  type FarmChatMessage,
} from './farmChatLog';

export const FARM_CHAT_HOT_TYPE = 'farm_chat';
export const FARM_CHAT_HOT_RECORD_ID = 'farm_chat';

export function farmChatToHotRecord(messages: readonly FarmChatMessage[]): HotRecord {
  const trimmed = trimFarmChat(messages);
  const last = trimmed[trimmed.length - 1];
  return {
    id: FARM_CHAT_HOT_RECORD_ID,
    type: FARM_CHAT_HOT_TYPE,
    ts: last?.at ?? new Date(0).toISOString(),
    author: last?.authorName ?? 'Crew',
    payload: { messages: trimmed },
  };
}

export function farmChatFromHotRecord(record: HotRecord): FarmChatMessage[] {
  if (record.type !== FARM_CHAT_HOT_TYPE && record.id !== FARM_CHAT_HOT_RECORD_ID) return [];
  const payload = record.payload as { messages?: unknown } | null;
  return parseFarmChatMessages(payload?.messages);
}

export function farmChatPlainBytes(messages: readonly FarmChatMessage[]): number {
  return new TextEncoder().encode(JSON.stringify(farmChatToHotRecord(messages))).byteLength;
}

/** Chat alone must fit one Freenet 0.2 pack. Whole-Hot size is a separate budget. */
export function farmChatFitsPackBudget(messages: readonly FarmChatMessage[]): boolean {
  return farmChatPlainBytes(messages) <= FREENET02_MAX_BLOB_BYTES;
}

export { farmChatHotWatchPairOk };
