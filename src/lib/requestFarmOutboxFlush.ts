/**
 * Diary saves ask for a cloud flush without importing the outbox modules.
 * flushFarmOutbox binds the implementation on load (Plans/CODEBASE_HEALTH.md).
 * A call before that bind is a no-op; app startup loads the outbox first.
 */
type FarmOutboxFlush = (farmId: string) => void;

let impl: FarmOutboxFlush = () => {};

export function requestFarmOutboxFlush(farmId: string): void {
  impl(farmId);
}

export function bindFarmOutboxFlush(fn: FarmOutboxFlush): void {
  impl = fn;
}
