/**
 * Hosted cost contract for Farm feed Phase 0.
 *
 * Derive from issues / highlights / diary this farm already syncs.
 * No `messages` collection. No unbounded onSnapshot. No Cloud Function / FCM.
 * Plans/FARM_MESSAGING.md · Plans/FIREBASE_BILLING.md
 */

/** Phase 0 adds zero new Firestore paths on pufworks-am. */
export const FARM_FEED_FIRESTORE_PATHS: readonly string[] = [];

const FORBIDDEN = [
  'onSnapshot',
  "collection(db, 'messages')",
  'collection(db, "messages")',
  '/messages/',
] as const;

/** Pure guard used by tests — pack source must not contain these. */
export function farmFeedSourceLooksUnbounded(source: string): boolean {
  return FORBIDDEN.some((needle) => source.includes(needle));
}
