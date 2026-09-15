/**
 * Farm chat on Freenet Hot — live 5 + today's buffer in hot/current (HotKey).
 * Sealed days live at hot/chat-archive/{date}. No new slot. No JPEGs.
 * Plans/FARM_MESSAGING.md · Plans/FREENET_OPERATOR_FLOW.md §9.2
 */
import { FREENET02_MAX_BLOB_BYTES } from '../../../units/mist-freenet/src/freenet02-pack-id.ts';
import type { HotRecord } from '../../../units/mist-freenet/src/seal-hot.ts';
import {
  parseFarmChatArchiveIndex,
  type FarmChatArchiveRef,
  type FarmChatDayBuffer,
} from './farmChatDay';
import {
  FARM_CHAT_DAY_CAP,
  FARM_CHAT_LIVE_CAP,
  farmChatHotWatchPairOk,
  parseFarmChatMessages,
  trimFarmChat,
  type FarmChatMessage,
} from './farmChatLog';

export const FARM_CHAT_HOT_TYPE = 'farm_chat';
export const FARM_CHAT_HOT_RECORD_ID = 'farm_chat';

export type FarmChatHotPayload = {
  messages: FarmChatMessage[];
  dayDate?: string;
  dayMessages?: FarmChatMessage[];
  archives?: FarmChatArchiveRef[];
};

export function farmChatToHotRecord(payload: FarmChatHotPayload | readonly FarmChatMessage[]): HotRecord {
  const full: FarmChatHotPayload = Array.isArray(payload)
    ? { messages: trimFarmChat(payload, FARM_CHAT_LIVE_CAP) }
    : (() => {
        const extra = payload as FarmChatHotPayload;
        return {
          messages: trimFarmChat(extra.messages, FARM_CHAT_LIVE_CAP),
          ...(extra.dayDate ? { dayDate: extra.dayDate } : {}),
          ...(extra.dayMessages?.length
            ? { dayMessages: trimFarmChat(extra.dayMessages, FARM_CHAT_DAY_CAP) }
            : {}),
          ...(extra.archives?.length ? { archives: parseFarmChatArchiveIndex(extra.archives) } : {}),
        };
      })();
  const last = full.messages[full.messages.length - 1];
  return {
    id: FARM_CHAT_HOT_RECORD_ID,
    type: FARM_CHAT_HOT_TYPE,
    ts: last?.at ?? new Date(0).toISOString(),
    author: last?.authorName ?? 'Crew',
    payload: full,
  };
}

export function farmChatFromHotRecord(record: HotRecord): FarmChatMessage[] {
  return farmChatPayloadFromHotRecord(record).messages;
}

export function farmChatPayloadFromHotRecord(record: HotRecord): FarmChatHotPayload {
  if (record.type !== FARM_CHAT_HOT_TYPE && record.id !== FARM_CHAT_HOT_RECORD_ID) {
    return { messages: [] };
  }
  const payload = record.payload as FarmChatHotPayload | null;
  return {
    messages: parseFarmChatMessages(payload?.messages, FARM_CHAT_LIVE_CAP),
    ...(typeof payload?.dayDate === 'string' ? { dayDate: payload.dayDate } : {}),
    ...(payload?.dayMessages
      ? { dayMessages: parseFarmChatMessages(payload.dayMessages, FARM_CHAT_DAY_CAP) }
      : {}),
    ...(payload?.archives ? { archives: parseFarmChatArchiveIndex(payload.archives) } : {}),
  };
}

export function farmChatDayFromPayload(payload: FarmChatHotPayload): FarmChatDayBuffer | null {
  if (!payload.dayDate) return null;
  return { date: payload.dayDate, messages: payload.dayMessages ?? [] };
}

export function farmChatPlainBytes(payload: FarmChatHotPayload | readonly FarmChatMessage[]): number {
  return new TextEncoder().encode(JSON.stringify(farmChatToHotRecord(payload))).byteLength;
}

/** Live 5 + one day must fit one Freenet 0.2 pack. Archives are separate packs. */
export function farmChatFitsPackBudget(payload: FarmChatHotPayload | readonly FarmChatMessage[]): boolean {
  return farmChatPlainBytes(payload) <= FREENET02_MAX_BLOB_BYTES;
}

export { farmChatHotWatchPairOk };
