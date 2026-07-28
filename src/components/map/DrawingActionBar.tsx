/**
 * Touch-safe Finish / Undo / Cancel while drawing paddocks or tracks.
 * Avoids leaflet-draw's action menu ghost-clicks that place a point under the button.
 */
import React, { useEffect, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { Check, Undo2, X } from 'lucide-react';
import L from '../../lib/leaflet-window';
import {
  cancelActiveDrawing,
  drawHandlerCanFinish,
  drawHandlerIsPolygon,
  drawHandlerMarkerCount,
  finishActiveDrawing,
  getCurrentDrawHandler,
  markDrawUiInteraction,
  shieldLeafletDrawControls,
  subscribeDrawHandlerChange,
  undoLastDrawVertex,
} from '../../lib/mapDrawHelpers';

type Props = {
  map: LeafletMap | null;
  /** Only show in edit mode */
  enabled: boolean;
};

export function DrawingActionBar({ map, enabled }: Props) {
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState(0);
  const [isPolygon, setIsPolygon] = useState(true);

  useEffect(() => {
    if (!map || !enabled) {
      setActive(false);
      setPoints(0);
      return;
    }

    const setDrawBarClass = (on: boolean) => {
      map.getContainer().classList.toggle('pufom-using-draw-bar', on);
    };

    const sync = () => {
      const h = getCurrentDrawHandler();
      const on = Boolean(h?._enabled);
      setActive(on);
      setPoints(drawHandlerMarkerCount(h));
      setIsPolygon(drawHandlerIsPolygon(h));
      setDrawBarClass(on);
      if (on) shieldLeafletDrawControls(map.getContainer());
    };

    const onStart = () => {
      sync();
      requestAnimationFrame(() => shieldLeafletDrawControls(map.getContainer()));
    };
    const onVertex = () => sync();
    const onStop = () => {
      setActive(false);
      setPoints(0);
      setDrawBarClass(false);
    };

    const DrawEvent = (L as unknown as { Draw?: { Event?: Record<string, string> } }).Draw?.Event;
    const DRAWSTART = DrawEvent?.DRAWSTART || 'draw:drawstart';
    const DRAWVERTEX = DrawEvent?.DRAWVERTEX || 'draw:drawvertex';
    const DRAWSTOP = DrawEvent?.DRAWSTOP || 'draw:drawstop';
    const CREATED = DrawEvent?.CREATED || 'draw:created';

    map.on(DRAWSTART, onStart);
    map.on(DRAWVERTEX, onVertex);
    map.on(DRAWSTOP, onStop);
    map.on(CREATED, onStop);
    const unsub = subscribeDrawHandlerChange(sync);
    sync();

    // Poll while mounted — recovers if another control calls map.off(type) without a fn
    // (StableEditControl previously wiped all draw:* listeners on unmount).
    const poll = window.setInterval(sync, 300);

    const obs = new MutationObserver(() => shieldLeafletDrawControls(map.getContainer()));
    obs.observe(map.getContainer(), { childList: true, subtree: true });

    return () => {
      map.off(DRAWSTART, onStart);
      map.off(DRAWVERTEX, onVertex);
      map.off(DRAWSTOP, onStop);
      map.off(CREATED, onStop);
      unsub();
      window.clearInterval(poll);
      obs.disconnect();
      setDrawBarClass(false);
    };
  }, [map, enabled]);

  if (!enabled || !active) return null;

  const canUndo = points > 0;
  const canFinish = drawHandlerCanFinish(getCurrentDrawHandler());

  const blockPointer = (e: React.SyntheticEvent) => {
    // stopPropagation only — preventDefault on pointerdown can kill the button click on Android.
    e.stopPropagation();
    markDrawUiInteraction(map as unknown as { _container?: HTMLElement });
  };

  return (
    <div
      className="pufom-draw-actions absolute bottom-28 lg:bottom-16 left-1/2 -translate-x-1/2 z-[1200] pointer-events-auto w-[calc(100%-1.5rem)] max-w-sm"
      onPointerDown={blockPointer}
      onTouchStart={blockPointer}
      onMouseDown={blockPointer}
      onClick={blockPointer}
    >
      <div className="flex items-stretch gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-xl p-2">
        <button
          type="button"
          disabled={!canUndo}
          onPointerDown={blockPointer}
          onClick={(e) => {
            blockPointer(e);
            undoLastDrawVertex();
            setPoints(drawHandlerMarkerCount(getCurrentDrawHandler()));
          }}
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold disabled:opacity-40 active:bg-slate-200"
        >
          <Undo2 size={20} className="pufom-map-icon shrink-0" aria-hidden />
          Undo point
        </button>
        <button
          type="button"
          disabled={!canFinish}
          onPointerDown={blockPointer}
          onClick={(e) => {
            blockPointer(e);
            finishActiveDrawing();
          }}
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40 active:bg-emerald-700"
        >
          <Check size={20} className="pufom-map-icon shrink-0" aria-hidden />
          Finish
        </button>
        <button
          type="button"
          onPointerDown={blockPointer}
          onClick={(e) => {
            blockPointer(e);
            cancelActiveDrawing();
          }}
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold active:bg-rose-100"
        >
          <X size={20} className="pufom-map-icon shrink-0" aria-hidden />
          Cancel
        </button>
      </div>
      <p className="text-center text-[10px] text-white/90 mt-1.5 drop-shadow lg:hidden">
        {canFinish
          ? 'Drag to pan · tap Finish to close'
          : isPolygon
            ? 'Drag to pan · tap to place · polygons need 3+ points'
            : 'Drag to pan · tap to place · tracks need 2+ points'}
      </p>
    </div>
  );
}
