/**
 * Local last-seen watermark for Farm feed For you badge.
 * Not a settings doc. Not a Firestore collection. Plans/FARM_MESSAGING.md
 */
export const FARM_FEED_LAST_SEEN_KEY_PREFIX = 'pufam.farmFeed.lastSeen.v1.';

export function farmFeedLastSeenKey(farmId: string): string {
  return `${FARM_FEED_LAST_SEEN_KEY_PREFIX}${farmId}`;
}

export function readFarmFeedLastSeen(farmId: string | null | undefined): string | null {
  if (!farmId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(farmFeedLastSeenKey(farmId));
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeFarmFeedLastSeen(farmId: string, iso: string = new Date().toISOString()): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(farmFeedLastSeenKey(farmId), iso);
  } catch {
    /* quota / private mode */
  }
}
