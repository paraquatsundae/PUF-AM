export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}
