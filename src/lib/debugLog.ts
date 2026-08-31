import { isWorkshopDiagnosticsEnabled } from './workshopMode';

/**
 * `console.log` for bench runs and workshop builds only.
 *
 * Tracing which cache a weather read came from is worth having while working on
 * the sync paths and worth nothing in a packaged APK on a tablet in a shed,
 * where it is noise in a console no one opens. Warnings and errors are not
 * routed through here — those matter wherever they happen.
 */
export function debugLog(...args: unknown[]): void {
  if (isWorkshopDiagnosticsEnabled()) console.log(...args);
}
