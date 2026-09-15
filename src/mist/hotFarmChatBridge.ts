/**
 * Pack-owned farm chat on Freenet Hot. Core must not import plugins/farm_feed
 * (`scripts/audit-codebase.mjs` — registry is the seam). The pack registers
 * at load; publish / watch use this bridge.
 * Plans/FARM_MESSAGING.md
 */

export type FarmChatHotLine = {
  id: string;
  at: string;
  authorName: string;
  text: string;
  authorUid?: string;
};

export type FarmChatHotArchiveRef = {
  date: string;
  contentHash: string;
  uri?: string;
};

/** Live 5 + today's buffer + archive index. Rides the farm_chat Hot record. */
export type FarmChatHotPayload = {
  messages: FarmChatHotLine[];
  dayDate?: string;
  dayMessages?: FarmChatHotLine[];
  archives?: FarmChatHotArchiveRef[];
};

export type FarmChatHotBridge = {
  list(farmId: string): FarmChatHotLine[];
  payload?(farmId: string): FarmChatHotPayload;
  merge(farmId: string, incoming: FarmChatHotLine[] | FarmChatHotPayload): void;
  notify(farmId: string): void;
};

let registered: FarmChatHotBridge | null = null;

export function registerFarmChatHotBridge(bridge: FarmChatHotBridge): void {
  registered = bridge;
}

export function farmChatHotBridge(): FarmChatHotBridge | null {
  return registered;
}
