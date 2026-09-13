/**
 * Click points vs Paint while placing a “check this” highlight.
 * Paint owns the pointer (no map pan); switch to Click points to pan.
 */
import { MousePointer2, Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { HighlightDrawMode } from '../../lib/highlightPaintStroke';

type Props = {
  mode: HighlightDrawMode;
  onMode: (mode: HighlightDrawMode) => void;
};

export function HighlightDrawModeBar({ mode, onMode }: Props) {
  const paint = mode === 'paint';
  return (
    <div className="pufam-highlight-draw-bar absolute top-4 left-1/2 -translate-x-1/2 z-[1100] pointer-events-auto w-[calc(100%-1.5rem)] max-w-sm">
      <div className="bg-teal-700 text-white rounded-xl shadow-lg px-3 py-2 space-y-1.5">
        <p className="text-xs font-semibold text-center">
          {paint
            ? 'Paint — stroke the zone; add more strokes, then Send'
            : 'Click points — tap vertices · Finish when done'}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onMode('points')}
            aria-pressed={!paint}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 min-h-[40px] rounded-lg text-[11px] font-semibold border',
              !paint
                ? 'bg-white text-teal-800 border-white'
                : 'bg-teal-800/40 text-white border-teal-500/40'
            )}
          >
            <MousePointer2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Click points
          </button>
          <button
            type="button"
            onClick={() => onMode('paint')}
            aria-pressed={paint}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 min-h-[40px] rounded-lg text-[11px] font-semibold border',
              paint
                ? 'bg-white text-teal-800 border-white'
                : 'bg-teal-800/40 text-white border-teal-500/40'
            )}
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Paint
          </button>
        </div>
        <p className="text-[10px] text-teal-100 text-center leading-snug">
          {paint
            ? 'Stroke owns the map. Switch to Click points to pan. Undo drops the last stroke.'
            : 'Drag to pan. Switch to Paint to stroke with a finger or mouse.'}
        </p>
      </div>
    </div>
  );
}
