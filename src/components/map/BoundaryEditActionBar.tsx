/**
 * Save / Delete point / Cancel while editing an existing paddock boundary.
 */
import React from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { Check, Trash2, X } from 'lucide-react';
import { markDrawUiInteraction } from '../../lib/mapDrawHelpers';

type Props = {
  map: LeafletMap | null;
  enabled: boolean;
  selected: boolean;
  canDelete: boolean;
  onSave: () => void;
  onDeletePoint: () => void;
  onCancel: () => void;
};

export function BoundaryEditActionBar({
  map,
  enabled,
  selected,
  canDelete,
  onSave,
  onDeletePoint,
  onCancel,
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
      <p className="text-center text-[10px] text-white/90 mt-1.5 drop-shadow lg:hidden">
        {selected
          ? 'Drag to move · Delete point removes the selected vertex'
          : 'Tap a point to select · drag to move'}
      </p>
    </div>
  );
}
