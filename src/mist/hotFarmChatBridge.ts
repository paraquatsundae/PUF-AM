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

export type FarmChatHotBridge = {
  list(farmId: string): FarmChatHotLine[];
  merge(farmId: string, incoming: FarmChatHotLine[]): void;
  notify(farmId: string): void;
};

let registered: FarmChatHotBridge | null = null;

export function registerFarmChatHotBridge(bridge: FarmChatHotBridge): void {
  registered = bridge;
}

export function farmChatHotBridge(): FarmChatHotBridge | null {
  return registered;
}
