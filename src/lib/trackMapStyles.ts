/**
 * Farm-track stroke styles — high contrast vs indigo paddock fills (#4f46e5)
 * and readable on satellite basemaps (amber + dark outline via CSS class).
 */

export type TrackCategory = 'primary' | 'secondary' | 'service' | string;

/** Primary track stroke — bright amber (not emerald; clashes with canopy + indigo). */
export const TRACK_COLOR_PRIMARY = '#f59e0b';
/** Secondary tracks — sky, distinct from paddock indigo #4f46e5. */
export const TRACK_COLOR_SECONDARY = '#38bdf8';
/** Service / dashed tracks. */
export const TRACK_COLOR_SERVICE = '#fbbf24';
/** Selected / highlighted track — keep category amber; green glow via CSS class. */
export const TRACK_COLOR_HIGHLIGHT = TRACK_COLOR_PRIMARY;
/** Draw-preview stroke while placing a new track. */
export const TRACK_COLOR_DRAW = TRACK_COLOR_PRIMARY;

export const TRACK_CLASS = 'pufam-track-line';
export const TRACK_CLASS_HIGHLIGHT = 'pufam-track-line pufam-track-line--highlight';

/** CSS injected next to other OrchardMap leaflet overrides. */
export const PUFAM_TRACK_STROKE_CSS = `
path.pufam-track-line {
  stroke-linecap: round;
  stroke-linejoin: round;
  /* Dark halo so amber reads on pale satellite tiles and over indigo paddocks */
  filter:
    drop-shadow(0 0 1.2px #0f172a)
    drop-shadow(0 0 1.2px #0f172a)
    drop-shadow(0 1px 0 #0f172a);
}
/* Selected track: amber stroke stays; soft green glow pulses ~2s (ease-in-out). */
path.pufam-track-line--highlight {
  filter:
    drop-shadow(0 0 2px #0f172a)
    drop-shadow(0 0 4px rgba(34, 197, 94, 0.55))
    drop-shadow(0 0 10px rgba(74, 222, 128, 0.4));
  animation: pufam-track-highlight-pulse 2s ease-in-out infinite;
}
@keyframes pufam-track-highlight-pulse {
  0%, 100% {
    filter:
      drop-shadow(0 0 2px #0f172a)
      drop-shadow(0 0 3px rgba(22, 163, 74, 0.4))
      drop-shadow(0 0 7px rgba(34, 197, 94, 0.28));
  }
  50% {
    filter:
      drop-shadow(0 0 2px #0f172a)
      drop-shadow(0 0 6px rgba(34, 197, 94, 0.75))
      drop-shadow(0 0 14px rgba(74, 222, 128, 0.55));
  }
}
@media (prefers-reduced-motion: reduce) {
  path.pufam-track-line--highlight {
    animation: none;
    filter:
      drop-shadow(0 0 2px #0f172a)
      drop-shadow(0 0 5px rgba(34, 197, 94, 0.65))
      drop-shadow(0 0 10px rgba(74, 222, 128, 0.4));
  }
}
`;

export function trackStrokeColor(category: TrackCategory | undefined | null): string {
  if (category === 'secondary') return TRACK_COLOR_SECONDARY;
  if (category === 'service') return TRACK_COLOR_SERVICE;
  return TRACK_COLOR_PRIMARY;
}

export function trackPathStyle(
  category: TrackCategory | undefined | null,
  opts?: { highlighted?: boolean }
): {
  color: string;
  weight: number;
  opacity: number;
  dashArray: string;
  className: string;
} {
  const highlighted = Boolean(opts?.highlighted);
  const categoryColor = trackStrokeColor(category);
  return {
    // Keep high-contrast category stroke (amber/sky); selection = green CSS glow
    color: categoryColor,
    weight: highlighted ? 7 : category === 'service' ? 3.5 : 5,
    opacity: 1,
    dashArray: category === 'service' ? '10, 10' : '',
    className: highlighted ? TRACK_CLASS_HIGHLIGHT : TRACK_CLASS,
  };
}

/** Tailwind chrome for track list category chips (mirrors stroke hues). */
export function trackCategoryChipClass(category: TrackCategory | undefined | null): string {
  if (category === 'secondary') {
    return 'bg-sky-50 text-sky-700 border-sky-100';
  }
  if (category === 'service') {
    return 'bg-amber-50 text-amber-800 border-amber-100';
  }
  return 'bg-amber-50 text-amber-700 border-amber-100';
}
