const buckets = new Map<string, number[]>();

/** Sliding window. Same shape as `server/accessPinAuth.ts`. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const prev = buckets.get(key) || [];
  const recent = prev.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function resetRateLimitForTests(): void {
  buckets.clear();
}
