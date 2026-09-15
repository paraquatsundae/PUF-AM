/**
 * Hosted cost contract for Farm feed.
 *
 * Phase 0: derive from issues / highlights / diary this farm already syncs.
 * Phase 1: one rolling chat doc `farms/{farmId}/farm_chat/log` (last 80 lines).
 * No `messages` collection. No unbounded collection onSnapshot. No Cloud Function / FCM.
 * Plans/FARM_MESSAGING.md · Plans/FIREBASE_BILLING.md
 */

export const FARM_CHAT_COLLECTION = 'farm_chat';
export const FARM_CHAT_DOC_ID = 'log';
export const FARM_FEED_FIRESTORE_PATHS = ['farms/{farmId}/farm_chat/log'] as const;

export function farmChatDocPath(farmId: string): string {
  return `farms/${farmId}/${FARM_CHAT_COLLECTION}/${FARM_CHAT_DOC_ID}`;
}

const FORBIDDEN = [
  "collection(db, 'messages')",
  'collection(db, "messages")',
  '/messages/',
] as const;

/** True when source looks like an unbounded growing-collection listen. */
export function farmFeedSourceLooksUnbounded(source: string): boolean {
  if (FORBIDDEN.some((needle) => source.includes(needle))) return true;
  if (/onSnapshot\s*\(\s*collection\s*\(/.test(source)) return true;
  if (/onSnapshot\s*\(\s*query\s*\(/.test(source)) return true;
  return false;
}
