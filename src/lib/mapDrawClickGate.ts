/**
 * Gate vertex placement while a paddock / track / infra polygon is being drawn.
 *
 * Leaflet + leaflet-draw event order after a touch pan or pinch-zoom
 * (Android WebView / Samsung tablet):
 *   touchend → dragend and/or zoomend → moveend → synthesized
 *   mousedown / mouseup / click (0–300 ms later).
 *
 * leaflet-draw Polyline._onMouseDown sets `_clickHandled` and `_disableMarkers`.
 * `_enableNewMarkers` only runs from `_endPoint` (50 ms later). If we ignore
 * that mouseup because it was a pan — and leave those flags set — every later
 * tap is dropped until the user cancels and restarts the polygon.
 *
 * After move/zoom: clear the sticky flags, skip the synthesized *mouse* click,
 * and accept the next genuine touch tap immediately.
 */

export const DRAW_UI_IGNORE_MS = 600;
/** Covers Android’s ~300 ms ghost click after touchend. Mouse path only. */
export const SYNTHETIC_MOUSE_SKIP_MS = 400;

let drawUiIgnoreUntil = 0;
let skipSyntheticMouseUntil = 0;

export function markDrawUiIgnore(now = Date.now(), ms = DRAW_UI_IGNORE_MS): void {
  drawUiIgnoreUntil = now + ms;
}

export function clearDrawUiIgnore(): void {
  drawUiIgnoreUntil = 0;
}

export function isDrawUiIgnoreActive(now = Date.now()): boolean {
  return now < drawUiIgnoreUntil;
}

export function armSkipSyntheticMouse(now = Date.now(), ms = SYNTHETIC_MOUSE_SKIP_MS): void {
  skipSyntheticMouseUntil = now + ms;
}

export function consumeSkipSyntheticMouse(now = Date.now()): boolean {
  if (now >= skipSyntheticMouseUntil) return false;
  skipSyntheticMouseUntil = 0;
  return true;
}

export function resetDrawClickGate(): void {
  drawUiIgnoreUntil = 0;
  skipSyntheticMouseUntil = 0;
}

export type StickyDrawHandler = {
  _pufomPanning?: boolean;
  _touchHandled?: unknown;
  _clickHandled?: unknown;
  _mouseDownOrigin?: unknown;
  _disableMarkers?: boolean;
};

export function clearStickyDrawFlags(handler: StickyDrawHandler | null | undefined): void {
  if (!handler) return;
  handler._pufomPanning = false;
  handler._touchHandled = null;
  handler._clickHandled = null;
  handler._mouseDownOrigin = null;
  if (handler._disableMarkers) handler._disableMarkers = false;
}

/** After pan/zoom: unlock the drawer and skip only the trailing mouse click. */
export function prepareDrawHandlerAfterMapGesture(
  handler: StickyDrawHandler | null | undefined,
  now = Date.now()
): void {
  clearStickyDrawFlags(handler);
  armSkipSyntheticMouse(now);
}

/** Genuine tap/click may place a vertex (UI ignore and in-progress pan still block). */
export function shouldAcceptDrawVertexAfterMapMove(
  handler: StickyDrawHandler | null | undefined,
  now = Date.now()
): boolean {
  if (handler?._pufomPanning) return false;
  if (now < drawUiIgnoreUntil) return false;
  return true;
}
