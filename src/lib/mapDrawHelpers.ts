/**
 * Lifecycle helpers for leaflet-draw handlers started outside EditControl
 * (Quick Add + / programmatic enable). Prevents orphaned drawers after tab switches.
 *
 * Patches leaflet-draw so:
 * - Delete last point / Finish / Cancel do not place a vertex under the button
 * - Map can be panned while drawing without dropping a point (stock _onTouch
 *   places a vertex on every touchstart)
 */

import L from './leaflet-window';

export type LeafletDrawHandler = {
  enable: () => void;
  disable: () => void;
  deleteLastVertex?: () => void;
  completeShape?: () => void;
  _enabled?: boolean;
  _markers?: unknown[];
  type?: string;
  _map?: {
    dragging?: { enable: () => void; enabled?: () => boolean };
    touchExtend?: { enable: () => void; disable: () => void; enabled?: () => boolean };
    on: (type: string, fn: () => void) => void;
    off: (type: string, fn: () => void) => void;
  };
  _pufomPanGuards?: boolean;
  _pufomRemovePanGuards?: () => void;
  _pufomRestoredTouchExtend?: boolean;
  _pufomPanning?: boolean;
};

/** Most recently enabled polyline/polygon drawer (EditControl or Quick Add). */
let currentDrawHandler: LeafletDrawHandler | null = null;
let drawUiIgnoreUntil = 0;
let patched = false;
const drawHandlerListeners = new Set<() => void>();

/** Subscribe to draw-handler enable/disable/vertex changes (DrawingActionBar). */
export function subscribeDrawHandlerChange(fn: () => void): () => void {
  drawHandlerListeners.add(fn);
  return () => {
    drawHandlerListeners.delete(fn);
  };
}

export function notifyDrawHandlerChange(): void {
  drawHandlerListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* listener errors must not break draw */
    }
  });
}

/** Pixels — finger moved farther than this during a touch ⇒ pan, not a tap. */
const TAP_SLOP_PX = 12;
/** Extra fat-finger margin around draw / zoom controls. */
export const DRAW_UI_HIT_PAD_PX = 28;

const DRAW_UI_SELECTOR =
  '.leaflet-control, .leaflet-draw-toolbar, .leaflet-draw-actions, .leaflet-draw-section, .pufom-draw-actions, .leaflet-control-zoom, button, a[role="button"]';

export function getCurrentDrawHandler(): LeafletDrawHandler | null {
  return currentDrawHandler;
}

/** Call when the user taps draw UI (toolbar / our action bar) — blocks map vertex for a beat. */
export function markDrawUiInteraction(map?: { _container?: HTMLElement } | null): void {
  drawUiIgnoreUntil = Date.now() + 600;
  if (map && '_pufomIgnoreDrawUntil' in (map as object)) {
    (map as { _pufomIgnoreDrawUntil: number })._pufomIgnoreDrawUntil = drawUiIgnoreUntil;
  } else if (map) {
    (map as { _pufomIgnoreDrawUntil: number })._pufomIgnoreDrawUntil = drawUiIgnoreUntil;
  }
}

function eventClientPoint(e: {
  originalEvent?: Event;
  clientX?: number;
  clientY?: number;
}): { x: number; y: number } | null {
  const oe = (e.originalEvent || e) as
    | (TouchEvent & MouseEvent)
    | MouseEvent
    | undefined;
  if (!oe) return null;
  const touch =
    (oe as TouchEvent).changedTouches?.[0] ||
    (oe as TouchEvent).touches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (typeof (oe as MouseEvent).clientX === 'number') {
    return { x: (oe as MouseEvent).clientX, y: (oe as MouseEvent).clientY };
  }
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
    return { x: e.clientX, y: e.clientY };
  }
  return null;
}

/** Pure helper — true when (x,y) sits inside any control rect (+ pad). */
export function pointHitsDrawUi(
  x: number,
  y: number,
  root: ParentNode = document,
  padPx: number = DRAW_UI_HIT_PAD_PX
): boolean {
  const nodes = root.querySelectorAll(
    '.leaflet-draw-toolbar, .leaflet-draw-actions, .pufom-draw-actions, .leaflet-control-zoom, .leaflet-control'
  );
  for (const node of Array.from(nodes)) {
    const el = node as HTMLElement;
    if (!el.getBoundingClientRect) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (
      x >= r.left - padPx &&
      x <= r.right + padPx &&
      y >= r.top - padPx &&
      y <= r.bottom + padPx
    ) {
      return true;
    }
  }
  return false;
}

export function touchTargetIsDrawUi(e: {
  originalEvent?: Event;
  target?: EventTarget | null;
  clientX?: number;
  clientY?: number;
}): boolean {
  const oe = (e.originalEvent || e) as Event;
  const t = (oe.target || e.target) as HTMLElement | null;
  if (t && typeof t.closest === 'function' && t.closest(DRAW_UI_SELECTOR)) {
    return true;
  }
  const pt = eventClientPoint(e);
  if (pt && pointHitsDrawUi(pt.x, pt.y)) return true;
  return false;
}

export function shouldIgnoreMapDrawInput(
  e: { originalEvent?: Event; target?: EventTarget | null; clientX?: number; clientY?: number },
  handler?: LeafletDrawHandler | null
): boolean {
  if (Date.now() < drawUiIgnoreUntil) return true;
  if (handler?._pufomPanning) return true;
  return touchTargetIsDrawUi(e);
}

/** Allow tap-to-vertex immediately after zoom (clears pan-swallow window). */
export function clearDrawUiIgnoreWindow(): void {
  drawUiIgnoreUntil = 0;
  const h = currentDrawHandler;
  if (h) h._pufomPanning = false;
}

function attachPanGuards(handler: LeafletDrawHandler): void {
  const map = handler._map;
  if (!map || handler._pufomPanGuards) return;
  handler._pufomPanGuards = true;

  const onDragStart = () => {
    handler._pufomPanning = true;
    markDrawUiInteraction(map as { _container?: HTMLElement });
  };
  const onDragEnd = () => {
    handler._pufomPanning = false;
    // Swallow the trailing click/mouseup that often follows a pan on Android.
    drawUiIgnoreUntil = Date.now() + 450;
    markDrawUiInteraction(map as { _container?: HTMLElement });
  };
  // Zoom must not look like pan — clear flags and allow immediate tap-to-vertex.
  const onZoomEnd = () => {
    handler._pufomPanning = false;
    drawUiIgnoreUntil = 0;
  };

  map.on('dragstart', onDragStart);
  map.on('dragend', onDragEnd);
  map.on('zoomstart', onZoomEnd);
  map.on('zoomend', onZoomEnd);
  handler._pufomRemovePanGuards = () => {
    map.off('dragstart', onDragStart);
    map.off('dragend', onDragEnd);
    map.off('zoomstart', onZoomEnd);
    map.off('zoomend', onZoomEnd);
    handler._pufomPanGuards = false;
    handler._pufomRemovePanGuards = undefined;
  };

  // Keep pan available while drawing (some builds leave it awkward on touch).
  try {
    map.dragging?.enable();
  } catch {
    /* ignore */
  }

  // leaflet-draw TouchExtend synthesizes map events that fight with pan-to-draw.
  // Keep it off; mouse path + gated _endPoint handle taps.
  try {
    if (map.touchExtend?.enabled?.()) {
      map.touchExtend.disable();
      handler._pufomRestoredTouchExtend = true;
    }
  } catch {
    /* ignore */
  }
}

function detachPanGuards(handler: LeafletDrawHandler): void {
  try {
    handler._pufomRemovePanGuards?.();
  } catch {
    /* ignore */
  }
  if (handler._pufomRestoredTouchExtend) {
    try {
      handler._map?.touchExtend?.enable();
    } catch {
      /* ignore */
    }
    handler._pufomRestoredTouchExtend = false;
  }
  handler._pufomPanning = false;
}

/**
 * Mark draw toolbars so map ignore logic applies.
 * Do not capture-stopPropagation — that blocked stock Finish/Delete links on iOS.
 */
export function shieldLeafletDrawControls(root: ParentNode = document): void {
  const nodes = root.querySelectorAll(
    '.leaflet-draw-toolbar, .leaflet-draw-actions, .leaflet-draw-actions-top, .leaflet-draw-actions-bottom'
  );
  nodes.forEach((node) => {
    const el = node as HTMLElement;
    if (el.dataset.pufomShielded === '1') return;
    el.dataset.pufomShielded = '1';
    try {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    } catch {
      /* ignore */
    }
    const mark = () => {
      markDrawUiInteraction();
    };
    el.addEventListener('pointerdown', mark, true);
    el.addEventListener('touchstart', mark, true);
    el.addEventListener('mousedown', mark, true);
  });
}

/**
 * One-time prototype patch for tablet draw UX.
 * Safe to call from app bootstrap after leaflet-draw is imported.
 */
export function patchLeafletDrawTouchGuards(): void {
  if (patched || typeof window === 'undefined') return;
  const Draw = (L as unknown as { Draw?: { Polyline?: { prototype: Record<string, unknown> } } }).Draw;
  const proto = Draw?.Polyline?.prototype;
  if (!proto) return;
  patched = true;

  const origEnable = proto.enable as (this: LeafletDrawHandler, ...a: unknown[]) => void;
  proto.enable = function (this: LeafletDrawHandler, ...args: unknown[]) {
    currentDrawHandler = this;
    const result = origEnable.apply(this, args as []);
    attachPanGuards(this);
    notifyDrawHandlerChange();
    // Actions list is created asynchronously — shield after paint
    requestAnimationFrame(() => shieldLeafletDrawControls());
    setTimeout(() => shieldLeafletDrawControls(), 50);
    setTimeout(() => shieldLeafletDrawControls(), 200);
    return result;
  };

  const origDisable = proto.disable as (this: LeafletDrawHandler, ...a: unknown[]) => void;
  proto.disable = function (this: LeafletDrawHandler, ...args: unknown[]) {
    detachPanGuards(this);
    if (currentDrawHandler === this) currentDrawHandler = null;
    const result = origDisable.apply(this, args as []);
    notifyDrawHandlerChange();
    return result;
  };

  /**
   * Stock _onTouch places a vertex on touchstart (before any move), so a pan
   * always drops a point. Replace with tap-vs-pan: only commit on touchend if
   * the finger barely moved.
   */
  const startPoint = proto._startPoint as
    | ((this: LeafletDrawHandler, x: number, y: number) => void)
    | undefined;
  const endPoint = proto._endPoint as
    | ((this: LeafletDrawHandler, x: number, y: number, e: unknown) => void)
    | undefined;
  const disableNewMarkers = proto._disableNewMarkers as
    | ((this: LeafletDrawHandler) => void)
    | undefined;

  // Gate stock _endPoint (mouse + synthetic paths) against UI / pan.
  if (typeof endPoint === 'function') {
    proto._endPoint = function (
      this: LeafletDrawHandler,
      x: number,
      y: number,
      e: unknown
    ) {
      if (
        this._pufomPanning ||
        Date.now() < drawUiIgnoreUntil ||
        shouldIgnoreMapDrawInput(
          (e as { originalEvent?: Event }) || { clientX: x, clientY: y },
          this
        ) ||
        pointHitsDrawUi(x, y)
      ) {
        (this as { _mouseDownOrigin?: unknown })._mouseDownOrigin = null;
        return;
      }
      return endPoint.call(this, x, y, e);
    };
  }

  proto._onTouch = function (this: LeafletDrawHandler & Record<string, unknown>, t: unknown) {
    const e = t as {
      originalEvent?: TouchEvent;
      latlng?: unknown;
    };
    if (shouldIgnoreMapDrawInput(e, this)) return;

    const oe = e.originalEvent;
    // Pinch / two-finger zoom — never start a vertex gesture.
    if ((oe?.touches?.length ?? 0) > 1 || (oe?.targetTouches?.length ?? 0) > 1) {
      this._pufomPanning = false;
      (this as { _touchHandled?: unknown })._touchHandled = null;
      return;
    }
    const touch0 = oe?.touches?.[0];
    if (
      !oe ||
      !touch0 ||
      this._clickHandled ||
      this._touchHandled ||
      this._disableMarkers
    ) {
      return;
    }

    const startX = touch0.clientX;
    const startY = touch0.clientY;
    let isPan = false;

    // Block synthetic mousedown/mouseup from also placing a vertex for this gesture.
    (this as { _touchHandled?: boolean })._touchHandled = true;

    const onMove = (ev: TouchEvent) => {
      const moveTouch = ev.touches?.[0];
      if (!moveTouch) return;
      if (
        Math.abs(moveTouch.clientX - startX) > TAP_SLOP_PX ||
        Math.abs(moveTouch.clientY - startY) > TAP_SLOP_PX
      ) {
        isPan = true;
        this._pufomPanning = true;
      }
    };

    const cleanup = () => {
      document.removeEventListener('touchmove', onMove, true);
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('touchcancel', onEnd, true);
    };

    const onEnd = (ev: TouchEvent) => {
      cleanup();
      const endTouch = ev.changedTouches?.[0];
      const endX = endTouch?.clientX ?? startX;
      const endY = endTouch?.clientY ?? startY;
      if (
        isPan ||
        this._pufomPanning ||
        Date.now() < drawUiIgnoreUntil ||
        pointHitsDrawUi(endX, endY) ||
        Math.abs(endX - startX) > TAP_SLOP_PX ||
        Math.abs(endY - startY) > TAP_SLOP_PX
      ) {
        this._pufomPanning = false;
        (this as { _mouseDownOrigin?: unknown })._mouseDownOrigin = null;
        (this as { _clickHandled?: unknown })._clickHandled = null;
        (this as { _touchHandled?: unknown })._touchHandled = null;
        // Swallow synthetic mouseup after a pan
        drawUiIgnoreUntil = Date.now() + 450;
        return;
      }

      // True tap — place vertex after touchend (not on touchstart)
      try {
        disableNewMarkers?.call(this);
        startPoint?.call(this, startX, startY);

        const map = this._map as
          | {
              mouseEventToContainerPoint: (el: { clientX: number; clientY: number }) => unknown;
              containerPointToLayerPoint: (p: unknown) => unknown;
              layerPointToLatLng: (p: unknown) => unknown;
            }
          | undefined;

        let latlng = e.latlng;
        if (map && !latlng) {
          const containerPoint = map.mouseEventToContainerPoint({ clientX: endX, clientY: endY });
          const layerPoint = map.containerPointToLayerPoint(containerPoint);
          latlng = map.layerPointToLatLng(layerPoint);
        }

        endPoint?.call(this, endX, endY, {
          latlng,
          originalEvent: ev,
        });
        // Brief ignore so trailing mouseup cannot double-place
        drawUiIgnoreUntil = Date.now() + 300;
      } finally {
        (this as { _touchHandled?: unknown })._touchHandled = null;
        (this as { _clickHandled?: unknown })._clickHandled = null;
        (this as { _mouseDownOrigin?: unknown })._mouseDownOrigin = null;
        this._pufomPanning = false;
      }
    };

    document.addEventListener('touchmove', onMove, true);
    document.addEventListener('touchend', onEnd, true);
    document.addEventListener('touchcancel', onEnd, true);
  };

  // Mouse-up path — skip after UI taps / pans
  const origOnMouseUp = proto._onMouseUp as ((this: LeafletDrawHandler, e: unknown) => void) | undefined;
  if (typeof origOnMouseUp === 'function') {
    proto._onMouseUp = function (this: LeafletDrawHandler, e: unknown) {
      if (shouldIgnoreMapDrawInput(e as { originalEvent?: Event }, this)) {
        (this as { _mouseDownOrigin?: unknown })._mouseDownOrigin = null;
        return;
      }
      return origOnMouseUp.call(this, e);
    };
  }

  const origOnMouseDown = proto._onMouseDown as
    | ((this: LeafletDrawHandler, e: unknown) => void)
    | undefined;
  if (typeof origOnMouseDown === 'function') {
    proto._onMouseDown = function (this: LeafletDrawHandler, e: unknown) {
      if (shouldIgnoreMapDrawInput(e as { originalEvent?: Event }, this)) return;
      return origOnMouseDown.call(this, e);
    };
  }
}

export function cancelActiveDrawer(ref: { current: LeafletDrawHandler | null }): void {
  const drawer = ref.current;
  if (!drawer) return;
  try {
    drawer.disable();
  } catch {
    // Handler may already be torn down by leaflet-draw
  }
  ref.current = null;
  if (currentDrawHandler === drawer) currentDrawHandler = null;
  notifyDrawHandlerChange();
}

export function startActiveDrawer(
  ref: { current: LeafletDrawHandler | null },
  drawer: LeafletDrawHandler
): void {
  cancelActiveDrawer(ref);
  drawer.enable();
  ref.current = drawer;
  currentDrawHandler = drawer;
  notifyDrawHandlerChange();
}

/**
 * After zoom/pinch, leaflet-draw + our pan guards can leave the handler ignoring
 * taps (or briefly disabled) with vertices intact. Revive without recreating.
 * Returns true if a drawer is enabled afterwards.
 */
export function reviveActiveDrawer(ref: {
  current: LeafletDrawHandler | null;
}): boolean {
  drawUiIgnoreUntil = 0;
  const drawer = ref.current;
  if (!drawer) return false;

  const sticky = drawer as LeafletDrawHandler & {
    _touchHandled?: unknown;
    _clickHandled?: unknown;
    _mouseDownOrigin?: unknown;
    _disableMarkers?: boolean;
  };
  sticky._pufomPanning = false;
  sticky._touchHandled = null;
  sticky._clickHandled = null;
  sticky._mouseDownOrigin = null;
  if (sticky._disableMarkers) sticky._disableMarkers = false;

  try {
    if (!drawer._enabled) {
      drawer.enable();
    } else {
      currentDrawHandler = drawer;
      // Pan guards attach on enable; ensure they exist if already enabled.
      attachPanGuards(drawer);
    }
  } catch {
    return Boolean(drawer._enabled);
  }
  currentDrawHandler = drawer;
  notifyDrawHandlerChange();
  return Boolean(drawer._enabled);
}

export function drawHandlerMarkerCount(handler: LeafletDrawHandler | null): number {
  if (!handler?._markers || !Array.isArray(handler._markers)) return 0;
  return handler._markers.length;
}

export function drawHandlerIsPolygon(handler: LeafletDrawHandler | null): boolean {
  const kind = String(handler?.type || '').toLowerCase();
  return kind === 'polygon';
}

/** Polygon needs ≥3 vertices; polyline ≥2. */
export function drawHandlerCanFinish(handler: LeafletDrawHandler | null): boolean {
  if (!handler?._enabled) return false;
  const n = drawHandlerMarkerCount(handler);
  if (drawHandlerIsPolygon(handler)) return n >= 3;
  return n >= 2;
}

export function undoLastDrawVertex(): boolean {
  const h = currentDrawHandler;
  if (!h?._enabled || typeof h.deleteLastVertex !== 'function') return false;
  markDrawUiInteraction();
  try {
    h.deleteLastVertex();
    notifyDrawHandlerChange();
    return true;
  } catch {
    return false;
  }
}

export function finishActiveDrawing(): boolean {
  const h = currentDrawHandler;
  if (!h?._enabled || !drawHandlerCanFinish(h)) return false;
  markDrawUiInteraction();
  try {
    if (typeof h.completeShape === 'function') {
      h.completeShape();
      notifyDrawHandlerChange();
      return true;
    }
    h.disable();
    notifyDrawHandlerChange();
    return true;
  } catch {
    return false;
  }
}

export function cancelActiveDrawing(): boolean {
  const h = currentDrawHandler;
  if (!h?._enabled) return false;
  markDrawUiInteraction();
  try {
    h.disable();
    notifyDrawHandlerChange();
    return true;
  } catch {
    return false;
  }
}
