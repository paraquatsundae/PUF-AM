/**
 * Save / Delete point / Cancel while editing an existing paddock boundary.
 * Optional second row starts an internal boundary draw (cancels vertex edit via parent).
 */
import React from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { Check, Hexagon, Trash2, X } from 'lucide-react';
import { markDrawUiInteraction } from '../../lib/mapDrawHelpers';

export type InternalBoundaryKind = 'internal_passable' | 'internal_impassable';

type Props = {
  map: LeafletMap | null;
  enabled: boolean;
  selected: boolean;
  canDelete: boolean;
  onSave: () => void;
  onDeletePoint: () => void;
  onCancel: () => void;
  /** When set, shows Passable / Impassable shortcuts under the main bar. */
  onAddInternalBoundary?: (kind: InternalBoundaryKind) => void;
};

export function BoundaryEditActionBar({
  map,
  enabled,
  selected,
  canDelete,
  onSave,
  onDeletePoint,
  onCancel,
  onAddInternalBoundary,
}: Props) {
  if (!enabled) return null;

  const blockPointer = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    markDrawUiInteraction(map as unknown as { _container?: HTMLElement });
  };

  return (
    <div
      className="pufom-draw-actions absolute bottom-28 lg:bottom-16 left-1/2 -translate-x-1/2 z-[1200] pointer-events-auto w-[calc(100%-1.5rem)] max-w-md"
      onPointerDown={blockPointer}
      onTouchStart={blockPointer}
      onMouseDown={blockPointer}
      onClick={blockPointer}
    >
      <div className="flex items-stretch gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-xl p-2">
        <button
          type="button"
          disabled={!canDelete}
          onPointerDown={blockPointer}
          onClick={(e) => {
            blockPointer(e);
            onDeletePoint();
          }}
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold disabled:opacity-40 active:bg-rose-100"
        >
          <Trash2 size={20} className="pufom-map-icon shrink-0" aria-hidden />
          Delete point
        </button>
        <button
          type="button"
          onPointerDown={blockPointer}
          onClick={(e) => {
            blockPointer(e);
            onSave();
          }}
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl bg-emerald-600 text-white text-xs font-semibold active:bg-emerald-700"
        >
          <Check size={20} className="pufom-map-icon shrink-0" aria-hidden />
          Save shape
        </button>
        <button
          type="button"
          onPointerDown={blockPointer}
          onClick={(e) => {
            blockPointer(e);
            onCancel();
          }}
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold active:bg-slate-200"
        >
          <X size={20} className="pufom-map-icon shrink-0" aria-hidden />
          Cancel
        </button>
      </div>
      {onAddInternalBoundary ? (
        <div className="mt-1.5 flex items-stretch gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg p-1.5">
          <button
            type="button"
            onPointerDown={blockPointer}
            onClick={(e) => {
              blockPointer(e);
              onAddInternalBoundary('internal_passable');
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl bg-stone-100 text-stone-800 text-[11px] font-semibold active:bg-stone-200"
            title="Draw a passable pad / hardstand inside this paddock"
          >
            <Hexagon size={16} className="pufom-map-icon shrink-0" aria-hidden />
            Pad (passable)
          </button>
          <button
            type="button"
            onPointerDown={blockPointer}
            onClick={(e) => {
              blockPointer(e);
              onAddInternalBoundary('internal_impassable');
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl bg-orange-50 text-orange-900 text-[11px] font-semibold active:bg-orange-100"
            title="Draw an impassable hazard zone (subtracts usable area)"
          >
            <Hexagon size={16} className="pufom-map-icon shrink-0" aria-hidden />
            Hazard zone
          </button>
        </div>
      ) : null}
      <p className="text-center text-[10px] text-white/90 mt-1.5 drop-shadow lg:hidden">
        {selected
          ? 'Drag to move · Delete point removes the selected vertex'
          : 'Tap a point to select · drag to move'}
      </p>
    </div>
  );
}
